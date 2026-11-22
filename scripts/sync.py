"""Une publication entière, ou conservation de la version précédente."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile

from rseq import ROOT, TEAMS, fetch, normalize, rank, require, team_schedule, team_standings


def synchronize(destination, reader=fetch):
    teams, players, errors = [], [], []
    standings = None
    schedule, game_counts = {}, {}
    for team_id, name in TEAMS.items():
        try:
            data = reader(team_id)
            team, eligible = normalize(team_id, data)
            current_standings = team_standings(data)
            if standings is None:
                standings = current_standings
            require(standings == current_standings, 'classement modifié pendant la collecte')
            for game_id, game in team_schedule(team_id, data).items():
                require(schedule.setdefault(game_id, game) == game, 'calendrier modifié pendant la collecte')
                game_counts[game_id] = game_counts.get(game_id, 0) + 1
            teams.append(team)
            players.extend(eligible)
            print(f"{name} : {team['games']} MJ, {len(eligible)} admissibles", flush=True)
        except Exception as error:
            errors.append(f'{name} ({team_id}) : {error}')
    require(not errors, '\n'.join(errors))
    require(len(teams) == 8 and players, 'jeu de données vide ou incomplet')
    require(all(count == 2 for count in game_counts.values()), 'calendrier incomplet')
    games = sorted(schedule.values(), key=lambda game: (
        game['date'] is None, game['date'] or '', game['time'] is None, game['time'] or '', game['id']))
    result = dict(season='2026-2027', updated=datetime.now(timezone.utc).isoformat(timespec='seconds'),
                  teams=teams, players=rank(players), standings=standings, games=games)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(mode='w', dir=destination.parent, delete=False, encoding='utf-8') as tmp:
        json.dump(result, tmp, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    Path(tmp.name).replace(destination)
    print(f"{len(players)} admissibles • {result['updated']}")


if __name__ == '__main__':
    try:
        synchronize(ROOT / 'site/data.json')
    except Exception as exc:
        sys.exit(f'Actualisation interrompue : {exc}')
