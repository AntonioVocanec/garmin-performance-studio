def migration_12(db):
    db.execute('''CREATE TABLE health_observations (observation_date TEXT NOT NULL,
        metric TEXT NOT NULL,value REAL NOT NULL,source TEXT NOT NULL,fetched_at TEXT NOT NULL,
        PRIMARY KEY(observation_date,metric))''')
    db.execute('''CREATE TABLE health_fetches (observation_date TEXT NOT NULL,source TEXT NOT NULL,
        status TEXT NOT NULL,attempted_at TEXT NOT NULL,message TEXT,PRIMARY KEY(observation_date,source))''')
    db.execute('''CREATE TABLE analytics_activity_snapshots (activity_id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,fetched_at TEXT NOT NULL)''')
    db.execute('''CREATE TABLE analytics_activity_coverage (activity_date TEXT PRIMARY KEY,
        complete INTEGER NOT NULL CHECK(complete IN (0,1)),fetched_at TEXT NOT NULL)''')
