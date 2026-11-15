from .health import finite


def suggestions(reference,items):
    distance=finite(reference.get('distanceMeters'))
    if distance is None or distance<=0:return []
    result=[]
    for item in items:
        d=finite(item.get('distanceMeters'))
        if str(item['id'])==str(reference['id']) or not item.get('isRun') or item.get('type')!=reference.get('type') or d is None:continue
        if abs(d-distance)/distance<=0.1+1e-12:
            r=finite(reference.get('avgHeartRate'));h=finite(item.get('avgHeartRate'))
            result.append({**item,'distanceDifferencePercent':(d/distance-1)*100,'heartRateDifference':h-r if h is not None and r is not None else None,
                'reason':'Isti podtip i udaljenost unutar ±10 %. Ruta nije provjerena.'})
    return sorted(result,key=lambda x:(abs(x['distanceDifferencePercent']),abs(x['heartRateDifference']) if x['heartRateDifference'] is not None else float('inf'),str(x['id'])))


def comparison(items,same_route=False):
    if not 2<=len(items)<=5 or len({str(i['id']) for i in items})!=len(items) or any(not i.get('isRun') for i in items):
        raise ValueError('Odaberi 2 do 5 različitih trčanja.')
    reference=items[0]
    warnings=['Vremenski uvjeti i podloga nisu poznati.','Usporedba nije laboratorijska mjera ekonomičnosti.']
    if len({i.get('type') for i in items})>1:warnings.append('Podtipovi trčanja razlikuju se, primjerice traka i vanjsko trčanje.')
    for item in items:
        item['differences']={key:finite(item.get(key))-finite(reference.get(key)) if finite(item.get(key)) is not None and finite(reference.get(key)) is not None else None
            for key in ['paceSecondsPerKm','avgHeartRate','elevationGain','distanceMeters']}
        item['conditions']={'weather':'unknown','surface':'unknown','route':'user_confirmed' if same_route else 'unverified'}
    return {'ok':True,'referenceId':str(reference['id']),'runs':items,'routeStatus':'Korisnik potvrdio istu poznatu rutu' if same_route else 'Ruta nije provjerena',
        'warnings':warnings,'source':'Garmin aktivnosti; usporedivost rute potvrđuje korisnik.'}
