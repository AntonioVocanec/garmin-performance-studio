import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

import server as core
from studio_analytics.health import read_history, store_results, fetch_chunk


class AnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.saved = core.ARCHIVE_PATH, core.BACKUP_DIR, core._archive_schema_ready
        core.ARCHIVE_PATH = Path(self.temp.name) / 'test.sqlite3'
        core.BACKUP_DIR = Path(self.temp.name) / 'backups'
        core._archive_schema_ready = False
        core.initialize_archive()
        self.end = date(2026, 11, 14)

    def tearDown(self):
        core.ARCHIVE_PATH, core.BACKUP_DIR, core._archive_schema_ready = self.saved
        self.temp.cleanup()

    def seed_health(self, day, **values):
        from studio_analytics.health import store_observations
        store_observations(core, day, values, 'Synthetic', '2026-11-15T00:00:00+00:00')

    def test_year_range_preserves_gaps_and_zero(self):
        start = self.end - timedelta(days=364)
        self.seed_health(str(start), hrv=50, stress=0)
        self.seed_health(str(self.end), hrv=60)
        result = read_history(core, start, self.end, ['hrv', 'stress'])
        self.assertEqual(len(result['rows']), 365)
        self.assertEqual(result['coverage']['hrv']['days'], 2)
        self.assertEqual(result['rows'][0]['stress'], 0)
        self.assertIsNone(result['rows'][1]['hrv'])
        with self.assertRaises(ValueError):
            read_history(core, start-timedelta(days=1), self.end, ['hrv'])

    def test_failed_fetch_keeps_observation_and_does_not_claim_coverage(self):
        self.seed_health(str(self.end), hrv=60)
        with patch.object(core, 'safe_call', return_value={'ok': False, 'status': 429}):
            result = fetch_chunk(core, self.end, self.end, ['hrv'])
        self.assertTrue(result['rateLimited'])
        history = read_history(core, self.end, self.end, ['hrv'])
        self.assertEqual(history['rows'][0]['hrv'], 60)
        self.assertFalse(history['coverage']['hrv']['fetchedDays'])

    def test_successful_empty_is_different_from_failed_source(self):
        with patch.object(core, 'safe_call', return_value={'ok': True, 'data': [], '_fetchedAt': '2026-11-15T00:00:00+00:00'}):
            fetch_chunk(core, self.end, self.end, ['hrv'])
        result = read_history(core, self.end, self.end, ['hrv'])
        self.assertEqual(result['coverage']['hrv']['fetchedDays'], 1)
        self.assertIsNone(result['rows'][0]['hrv'])

    def test_migration_is_additive_and_does_not_rewrite_nutrition(self):
        with core.archive_connection() as db:
            self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0], 12)
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertEqual(db.execute('SELECT COUNT(*) FROM nutrition_food_log_entries').fetchone()[0], 0)

    def test_contributions_keep_small_baselines_and_naps_separate(self):
        from studio_analytics.recovery import contributions
        r=contributions(self.end,{'totalSeconds':23000},{'debtSeconds':1000,'napCoverageDays':12,'daysAvailable':14},
            {'hrvLastNight':60},{'hrv':{'median28d':70,'sampleDays':6}}, {}, {})
        by_key={s['key']:s for s in r['signals']}
        self.assertIsNone(by_key['hrv']['baseline'])
        self.assertEqual(by_key['debt']['value'],1000)
        self.assertEqual(len(r['signals']),6)
        self.assertIsNone(by_key['load']['value'])

    def test_contributions_use_source_availability_not_zero(self):
        from studio_analytics.recovery import contributions
        r=contributions(self.end,{}, {}, {'hrvLastNight':60},{}, {}, {'hrv':{'ok':False}})
        self.assertIsNone(next(s for s in r['signals'] if s['key']=='hrv')['value'])

    def seed_activity(self, day, identifier='123', load=30, sauna=False):
        from studio_analytics.health import store_activities
        item={'id':identifier,'date':str(day),'name':'Sauna' if sauna else 'Synthetic run','type':'running',
            'isRun':not sauna,'isSauna':sauna,'distanceMeters':5000,'durationSeconds':1800,'trainingLoad':load}
        core.persist_activities([item]);store_activities(core,[item],{'ok':True},day,day)

    def test_nutrition_uses_confirmed_diary_day_and_next_day_not_same_day(self):
        from studio_analytics.training import nutrition_context
        self.seed_activity(self.end)
        self.seed_health(str(self.end),hrv=10)
        self.seed_health(str(self.end+timedelta(days=1)),hrv=90)
        result=nutrition_context(core,self.end,self.end)
        self.assertIn('Dnevnik nije potvrđen kao potpun.',result['rows'][0]['exclusions'])
        self.assertEqual(result['rows'][0]['nextHrv']['value'],90)
        with core.archive_connection() as db:db.execute('INSERT INTO nutrition_diary_days VALUES (?,1)',(str(self.end),))
        result=nutrition_context(core,self.end,self.end)
        self.assertEqual(result['rows'][0]['kcal'],0)
        self.assertEqual(result['eligibleDays'],1)

    def test_missing_load_is_not_zero_and_sauna_is_not_training(self):
        from studio_analytics.training import daily_loads
        self.seed_activity(self.end,'1',None)
        self.seed_activity(self.end,'2',500,True)
        with core.archive_connection() as db:result=daily_loads(db,self.end,self.end)
        self.assertEqual(result[str(self.end)]['activityCount'],1)
        self.assertIsNone(result[str(self.end)]['load'])

    def test_nutrition_terciles_require_five_complete_days_each(self):
        from studio_analytics.training import nutrition_context
        start=self.end-timedelta(days=20)
        for i in range(21):
            day=start+timedelta(days=i);self.seed_activity(day,str(i+10),i+1)
            with core.archive_connection() as db:db.execute('INSERT INTO nutrition_diary_days VALUES (?,1)',(str(day),))
        result=nutrition_context(core,start,self.end)
        self.assertTrue(result['sufficient'])
        self.assertEqual([g['days'] for g in result['groups']],[7,7])
        self.assertEqual([g['kcal']['value'] for g in result['groups']],[0,0])

    def test_run_suggestions_use_type_and_distance_not_name_as_route_proof(self):
        from studio_analytics.running import suggestions
        ref={'id':'1','isRun':True,'type':'running','distanceMeters':5000,'avgHeartRate':120}
        items=[ref,{**ref,'id':'2','distanceMeters':5500},{**ref,'id':'3','type':'treadmill_running'},
            {**ref,'id':'4','distanceMeters':5600},{**ref,'id':'5','avgHeartRate':None}]
        result=suggestions(ref,items)
        self.assertEqual([r['id'] for r in result],['5','2'])
        self.assertTrue(all('Ruta nije provjerena' in r['reason'] for r in result))

    def test_comparison_keeps_missing_measurements_and_route_confirmation_explicit(self):
        from studio_analytics.running import comparison
        a={'id':'1','isRun':True,'type':'running','avgHeartRate':None,'paceSecondsPerKm':300}
        b={**a,'id':'2','paceSecondsPerKm':290}
        result=comparison([a,b])
        self.assertEqual(result['routeStatus'],'Ruta nije provjerena')
        self.assertEqual(result['runs'][1]['differences']['paceSecondsPerKm'],-10)
        self.assertIsNone(result['runs'][1]['differences']['avgHeartRate'])
        with self.assertRaises(ValueError):comparison([a,a])
        self.assertEqual(comparison([a,b],True)['runs'][0]['conditions']['route'],'user_confirmed')

    def test_response_keeps_activity_rpe_and_day_fatigue_distinct(self):
        from studio_analytics.training import training_response
        self.seed_activity(self.end,'1',30);self.seed_activity(self.end,'2',50)
        core.save_activity_rpe('1',{'rpe':0})
        core.save_daily_journal({'date':str(self.end),'fatigue':2})
        core.save_daily_journal({'date':str(self.end+timedelta(days=1)),'fatigue':7})
        result=training_response(core,self.end,self.end)
        self.assertEqual(result['rated'],1)
        self.assertEqual(result['rows'][0]['rpe'],0)
        self.assertIsNone(result['rows'][1]['rpe'])
        self.assertEqual(result['rows'][0]['activitiesOnDay'],2)
        self.assertEqual(result['rows'][0]['sameDayFatigue']['fatigue'],2)
        self.assertEqual(result['rows'][0]['nextDayFatigue']['fatigue'],7)
        self.assertIsNone(result['groups'][0]['medianRpe'])

    def test_response_excludes_sauna_and_requires_five_rated_activities(self):
        from studio_analytics.training import training_response
        for i in range(5):
            self.seed_activity(self.end,str(i+1),10);core.save_activity_rpe(str(i+1),{'rpe':i+1})
        self.seed_activity(self.end,'99',10,True)
        result=training_response(core,self.end,self.end)
        self.assertEqual(result['total'],5)
        self.assertEqual(result['groups'][0]['medianRpe'],3)

    def legacy_snapshot(self):
        snapshot='{"kcal":"123.456","sourceId":"synthetic-source","versionId":"frozen-v1"}'
        with core.archive_connection() as db:
            for table in ['health_observations','health_fetches','analytics_activity_snapshots','analytics_activity_coverage']:
                db.execute('DROP TABLE '+table)
            db.execute('PRAGMA user_version=11')
            db.execute('INSERT INTO nutrition_food_log_entries VALUES (?,?,?,?,?,?,?,?,?,?)',('synthetic',str(self.end),'lunch','Synthetic snapshot',1000,'g',snapshot,None,0,'2026-11-14'))
        core._archive_schema_ready=False
        return snapshot

    def test_v11_upgrade_preserves_frozen_snapshot_and_creates_backup(self):
        expected=self.legacy_snapshot();core.initialize_archive()
        with core.archive_connection() as db:
            self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],12)
            self.assertEqual(db.execute('SELECT snapshot_json FROM nutrition_food_log_entries').fetchone()[0],expected)
        backups=list(core.BACKUP_DIR.glob('*.sqlite3'));self.assertEqual(len(backups),1)
        with closing(sqlite3.connect(backups[0])) as db:
            self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],11)
            self.assertEqual(db.execute('SELECT snapshot_json FROM nutrition_food_log_entries').fetchone()[0],expected)

    def test_failed_v12_migration_rolls_back_ddl_and_preserves_v11(self):
        expected=self.legacy_snapshot()
        def fail(db):
            db.execute('CREATE TABLE should_rollback (id INTEGER)')
            raise RuntimeError('Synthetic migration failure')
        with patch('studio_analytics.migrations.migration_12',side_effect=fail):
            with self.assertRaises(RuntimeError):core.initialize_archive()
        with core.archive_connection() as db:
            self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],11)
            self.assertFalse(db.execute("SELECT name FROM sqlite_master WHERE name='should_rollback'").fetchall())
            self.assertEqual(db.execute('SELECT snapshot_json FROM nutrition_food_log_entries').fetchone()[0],expected)

    def test_out_of_order_observations_do_not_replace_newer_measurement(self):
        from studio_analytics.health import store_observations
        store_observations(core,str(self.end),{'hrv':80},'Synthetic','2026-11-15T02:00:00+00:00')
        store_observations(core,str(self.end),{'hrv':50},'Synthetic','2026-11-15T01:00:00+00:00')
        self.assertEqual(read_history(core,self.end,self.end,['hrv'])['rows'][0]['hrv'],80)

    def test_dated_contributions_reject_previous_day_fallbacks(self):
        from studio_analytics.recovery import dated_inputs
        sleep,recovery=dated_inputs(self.end,{'date':'2026-11-13','totalSeconds':20000},
            {'hrvLastNight':80,'restingHeartRate':40,'bodyBattery':90,'bodyBatteryHistory':{'date':'2026-11-13','latestTime':'08:00'}},
            [{'date':'2026-11-13','hrv':80}],heart_date='2026-11-13')
        self.assertIsNone(sleep['totalSeconds'])
        self.assertIsNone(recovery['hrvLastNight'])
        self.assertIsNone(recovery['restingHeartRate'])
        self.assertIsNone(recovery['bodyBattery'])

    def test_skin_temperature_rate_limit_stops_single_day_calls(self):
        from unittest.mock import Mock
        client=Mock();client.get_daily_sleep.side_effect=core.GarminError('Synthetic limit',429)
        with patch.object(core,'_get_garmin_connect_client',return_value=client),patch.object(core,'_garmin_skin_temp_cache',{}):
            result=core.safe_garmin_skin_temperature_call(self.end,days=14)
        self.assertEqual(result['status'],429)
        self.assertEqual(client.get_daily_sleep.call_count,1)

    def test_partial_source_does_not_certify_entire_range(self):
        store_results(core,{'hrv':{'ok':True,'partial':True,'data':[{'calendarDate':str(self.end),'lastNightAvg':70}]}},self.end,self.end)
        result=read_history(core,self.end,self.end,['hrv'])
        self.assertEqual(result['rows'][0]['hrv'],70)
        self.assertEqual(result['coverage']['hrv']['fetchedDays'],0)

    def test_oversized_fetch_is_rejected_before_external_io(self):
        with patch.object(core,'safe_call') as call:
            with self.assertRaises(ValueError):fetch_chunk(core,self.end-timedelta(days=14),self.end,['hrv'])
            call.assert_not_called()
