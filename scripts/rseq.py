"""Lecture stricte des fiches officielles de la saison régulière."""
import json
import math
import time
from datetime import date, time as clock_time
from fractions import Fraction
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
TEAMS = json.loads((ROOT / 'config/teams.json').read_text())
LEAGUE = '3b9e2e05-e4d7-44ae-8720-5a3b6ee601a9'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fetch(team_id, opener=urlopen, pause=time.sleep):
    url = 'https://s1.rseq.ca/api/TeamApi/GetTeamDiffusion/?teamId=' + team_id
    for attempt in range(3):
        try:
            with opener(Request(url, headers={'Accept': 'application/json'}), timeout=20) as response:
                data = json.load(response)
            require(isinstance(data, dict) and data, 'réponse vide')
            return data
        except (URLError, OSError, ValueError) as error:
            print(f'{TEAMS[team_id]} ({team_id}), essai {attempt + 1}/3 : {error}', flush=True)
            if attempt == 2:
                raise
            pause(2 ** (attempt + 1))


def count(row, field):
    value = row[field]
    require(type(value) is int and value >= 0, f'{field} invalide : {value!r}')
    return value


def optional(row, field):
    # Une case officielle vide peut aussi masquer un zéro. Ne pas imputer.
    value = count(row, field)
    return None if value == 0 and not row[field + 'Formatted'] else value


def shooting(row, hudl):
    prefix = 'FieldThrows' if hudl else 'FieldGoals'
    made2 = count(row, prefix + '2Made')
    att2 = optional(row, prefix + '2Attemped')
    made3 = count(row, prefix + '3Made')
    att3 = optional(row, prefix + '3Attemped')
    if hudl:
        # Dans le tableau Hudl les deux premières colonnes sont LR et LT.
        made2 -= made3
        att2 = att2 - att3 if att2 is not None and att3 is not None else None
    require(made2 >= 0 and (att2 is None or att2 >= made2)
            and (att3 is None or att3 >= made3), 'lancers incohérents')
    return made2, att2, made3, att3


def regular_standings(data):
    rows = [s for s in data['Standings'] if s['SeasonType'] == 1 and s['LeagueId'] == LEAGUE]
    require(len(rows) == len(TEAMS) and {s['TeamId'] for s in rows} == TEAMS.keys(),
            'classement régulier incomplet')
    return rows


def team_standings(data):
    standings = []
    for row in regular_standings(data):
        team_id = row['TeamId']
        position = count(row, 'Position')
        require(1 <= position <= len(TEAMS), 'position au classement invalide')
        average, difference, points = row['AverageFormatted'], row['Diff2Formatted'], row['LeaguePoints']
        require(all(isinstance(value, str) and math.isfinite(float(value))
                    for value in (average, difference)), 'moyenne ou écart invalide')
        require(type(points) in (int, float) and math.isfinite(points), 'points de classement invalides')
        standings.append(dict(id=team_id, name=TEAMS[team_id], position=position,
                              games=count(row, 'GamesPlayed'), wins=count(row, 'Wins'),
                              losses=count(row, 'Losses'), pointsFor=count(row, 'PointsFor'),
                              pointsAgainst=count(row, 'PointsAgaints'), average=average,
                              difference=difference, points=points))
    return sorted(standings, key=lambda row: row['position'])


def team_schedule(team_id, data):
    games = {}
    for row in data['TeamGames']:
        if (row['LeagueId'] != LEAGUE or row['SeasonType'] != 1
                or not row['IsReleased'] or row['IsDeleted'] or row['IsByeWeek']):
            continue
        game_id = str(UUID(row['GameId']))
        visitor, home = row['VisitingTeamId'], row['HomeTeamId']
        require(visitor in TEAMS and home in TEAMS and visitor != home
                and team_id in (visitor, home) and game_id not in games,
                'match du calendrier mal associé ou en double')
        day, start = row['GameDateFormatted'], row['GameTimeFormatted']
        cancelled = row['IsCancelledAfterTeamWithdraw']
        score = None
        if not cancelled and not row['IsPartialResults'] and row['IsSubmittedForStandings']:
            score = [count(row, 'VisitingTeamScore'), count(row, 'HomeTeamScore')]
        games[game_id] = dict(id=game_id, visitor=visitor, home=home,
                              date=date.fromisoformat(day).isoformat() if day else None,
                              time=clock_time.fromisoformat(start).isoformat(timespec='minutes') if start else None,
                              venue=row['GameLocationFormatted'].strip(), score=score,
                              cancelled=cancelled)
    return games


def normalize(team_id, data):
    name = TEAMS[team_id]
    for key, value in {'TeamId': team_id, 'TeamName': name, 'LeagueId': LEAGUE,
                       'Sport': 'Basketball', 'Division': 'D2', 'SexType': 'Masculin',
                       'Conference': 'Nord-Est', 'Sector': 'Collégial'}.items():
        require(data[key] == value, f'{key} inattendu')
    require('(2026-2027)' in data['StandingsName'], 'saison inattendue')
    standings = regular_standings(data)
    games = count(next(s for s in standings if s['TeamId'] == team_id), 'GamesPlayed')
    hudl = data['showBasketballStatsHudlMethod']
    require((data['showBasketballStatsStandardMethod'], hudl) in [(True, False), (False, True)],
            'méthode statistique inconnue')
    rows = data['LeagueBasketballStats']
    require(isinstance(rows, list) and rows, 'statistiques individuelles vides')
    participants = {a['AthleteId'] for a in data['Athletes'] if count(a, 'NumberGamesPlayed') > 0}
    require(participants <= {r['AthleteId'] for r in rows}, 'effectif statistique incomplet')
    players = []
    seen = set()
    for row in rows:
        athlete = str(UUID(row['AthleteId']))
        require(athlete not in seen and row['TeamId'] == team_id and row['LeagueId'] == LEAGUE,
                'doublon ou mauvaise association')
        seen.add(athlete)
        mj, pts = count(row, 'GamesPlayed'), count(row, 'TotalPoints')
        require(count(row, 'TeamGames') == games and mj <= games, 'matchs incohérents')
        require(mj or pts == 0, 'points sans match')
        if not mj or mj * 2 < games:
            continue
        m2, a2, m3, a3 = shooting(row, hudl)
        ft, fta = count(row, 'FreeThrowsMade'), optional(row, 'FreeThrowsAttempted')
        require(fta is None or fta >= ft, 'lancers francs incohérents')
        require(2*m2 + 3*m3 + ft == pts, 'total de points incohérent')
        require(math.isclose(pts/mj, row['PointsPerGame'], abs_tol=1e-8), 'moyenne officielle divergente')
        first, last = row['AthleteFirstName'].strip(), row['AthleteLastName'].strip()
        require(first and last, 'nom incomplet')
        ro, rd = optional(row, 'OffensiveRebounds'), optional(row, 'DefensiveRebounds')
        rebounds = ro + rd if None not in (ro, rd) else optional(row, 'TotalRebounds')
        players.append(dict(id=athlete, name=f'{first} {last}', team=name, teamId=team_id,
                            number=row['NumberFormatted'], games=mj, points=pts, ppg=pts/mj,
                            m2=m2, a2=a2, m3=m3, a3=a3, ft=ft, fta=fta, ro=ro, rd=rd,
                            pct2=100*m2/a2 if a2 else None, pct3=100*m3/a3 if a3 else None,
                            pctft=100*ft/fta if fta else None, rebounds=rebounds,
                            rpg=rebounds/mj if rebounds is not None else None))
    require(not games or players, 'aucun joueur admissible malgré les matchs joués')
    return dict(id=team_id, name=name, games=games, method='Hudl' if hudl else 'standard',
                sourceCount=len(rows)), players


def rank(players):
    require(len({p['id'] for p in players}) == len(players), 'athlète associé à plusieurs équipes')
    ordered = sorted(players, key=lambda p: (-Fraction(p['points'], p['games']), -p['points'],
                                             -p['games'], p['name'].casefold(), p['id']))
    return [dict(p, rank=i) for i, p in enumerate(ordered, 1)]
