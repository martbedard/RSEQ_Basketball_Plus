import json
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.error import URLError
from uuid import uuid5, NAMESPACE_URL

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from rseq import LEAGUE, TEAMS, fetch, normalize, rank
from sync import synchronize

TEAM = next(iter(TEAMS))


def sample(team_id, games=3):
    athlete = str(uuid5(NAMESPACE_URL, team_id))
    row = dict(AthleteId=athlete, TeamId=team_id, LeagueId=LEAGUE, TeamGames=games,
               GamesPlayed=2, AthleteFirstName='Athlète', AthleteLastName='Essai',
               NumberFormatted='00', TotalPoints=10, PointsPerGame=5.0,
               FieldGoals2Made=3, FieldGoals3Made=1, FreeThrowsMade=1)
    for key, value in [('FieldGoals2Attemped',5),('FieldGoals3Attemped',2),
                       ('FreeThrowsAttempted',2),('OffensiveRebounds',0),
                       ('DefensiveRebounds',4),('TotalRebounds',4)]:
        row[key]=value
        row[key+'Formatted']=str(value) if value else ''
    return dict(TeamId=team_id, TeamName=TEAMS[team_id], LeagueId=LEAGUE, Sport='Basketball',
                Division='D2', SexType='Masculin', Conference='Nord-Est', Sector='Collégial',
                StandingsName='Test (2026-2027)', showBasketballStatsStandardMethod=True,
                showBasketballStatsHudlMethod=False, Athletes=[dict(AthleteId=athlete,NumberGamesPlayed=2)],
                Standings=[dict(TeamId=k, LeagueId=LEAGUE, SeasonType=1, Position=i,
                                GamesPlayed=games, Wins=2, Losses=games-2,
                                PointsFor=153, PointsAgaints=142, AverageFormatted='0.667',
                                Diff2Formatted='0.0', LeaguePoints=4)
                           for i, k in enumerate(reversed(TEAMS), 1)],
                LeagueBasketballStats=[row])


class RankingTests(unittest.TestCase):
    def test_boundary(self):
        for games, expected in [(3,1),(4,1),(5,0)]:
            data=sample(TEAM,games)
            other=dict(data['LeagueBasketballStats'][0], AthleteId=str(uuid5(NAMESPACE_URL,'other')),
                       GamesPlayed=games, PointsPerGame=10/games)
            data['LeagueBasketballStats'].append(other)
            self.assertEqual(len(normalize(TEAM,data)[1]),expected+1)

    def test_standard_and_missing(self):
        data=sample(TEAM)
        p=normalize(TEAM,data)[1][0]
        self.assertEqual((p['m2'],p['pct3'],p['pctft'],p['rpg'],p['number']),(3,50,50,2,'00'))
        self.assertIsNone(p['ro'])
        row=data['LeagueBasketballStats'][0]
        row.update(FieldGoals2Attemped=0,FieldGoals2AttempedFormatted='')
        self.assertIsNone(normalize(TEAM,data)[1][0]['pct2'])

    def test_hudl(self):
        data=sample(TEAM)
        data.update(showBasketballStatsStandardMethod=False,showBasketballStatsHudlMethod=True)
        data['LeagueBasketballStats'][0].update(FieldThrows2Made=4,FieldThrows3Made=1,
            FieldThrows2Attemped=7,FieldThrows3Attemped=2,FieldThrows2AttempedFormatted='7',
            FieldThrows3AttempedFormatted='2')
        p=normalize(TEAM,data)[1][0]
        self.assertEqual((p['m2'],p['a2'],p['pct2']),(3,5,60))

    def test_invalid_source(self):
        for change in [dict(TeamName='autre'),dict(StandingsName='2025-2026'),dict(Standings=[]),
                       dict(LeagueBasketballStats=[])]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                normalize(TEAM,dict(sample(TEAM),**change))
        for change in [dict(PointsPerGame=0),dict(TotalPoints=9),dict(TeamGames=2),
                       dict(TeamId='autre'),dict(GamesPlayed=4)]:
            data=sample(TEAM)
            data['LeagueBasketballStats'][0].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                normalize(TEAM,data)

    def test_identity_and_order(self):
        p=normalize(TEAM,sample(TEAM))[1][0]
        with self.assertRaises(ValueError): rank([p,p])
        rows=[dict(p,id=id,name=id,points=pts,games=mj) for id,pts,mj in
              [('b',20,4),('a',20,4),('c',5,1),('d',106,21)]]
        self.assertEqual([r['id'] for r in rank(rows)],['d','a','b','c'])
        self.assertEqual(rank(rows)[0]['rank'],1)

    def test_retry(self):
        attempts=[]
        def offline(*args,**kwargs):
            attempts.append(1)
            raise URLError('hors ligne')
        with self.assertRaises(URLError): fetch(TEAM,offline,lambda _:None)
        self.assertEqual(len(attempts),3)

    def test_atomic_publication(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'data.json'
            synchronize(path,sample)
            old=path.read_bytes()
            result=json.loads(old)
            self.assertEqual(len(result['teams']),8)
            self.assertEqual(len(result['players']),8)
            self.assertEqual([row['id'] for row in result['standings']], list(reversed(TEAMS)))
            self.assertEqual(result['standings'][0], dict(
                id=list(TEAMS)[-1], name=list(TEAMS.values())[-1], position=1, games=3,
                wins=2, losses=1, pointsFor=153, pointsAgainst=142, average='0.667',
                difference='0.0', points=4))
            self.assertTrue(all(TEAMS[p['teamId']]==p['team'] for p in result['players']))
            with self.assertRaisesRegex(ValueError,TEAMS[TEAM]):
                synchronize(path,lambda id: {} if id==TEAM else sample(id))
            self.assertEqual(path.read_bytes(),old)


    def test_mixed_standings(self):
        for field in ('GamesPlayed', 'PointsFor'):
            def changing(team_id):
                data = sample(team_id)
                if team_id != TEAM:
                    data['Standings'][0][field] += 1
                return data
            with self.subTest(field=field), tempfile.TemporaryDirectory() as folder:
                dest = Path(folder) / 'data.json'
                with self.assertRaisesRegex(ValueError, 'pendant la collecte'):
                    synchronize(dest, changing)
                self.assertFalse(dest.exists())
