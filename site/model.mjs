export const columns = [
  ["rank", "Rang", "Rang général"],
  ["name", "Joueur", "Nom complet"],
  ["team", "Équipe", "Équipe"],
  ["ppg", "PTS/MJ", "Points par match"],
  ["number", "No", "Numéro de maillot"],
  ["games", "MJ", "Matchs joués"],
  ["m2", "LR 2", "Tirs à deux points réussis"],
  ["a2", "LT 2", "Tirs à deux points tentés"],
  ["m3", "LR 3", "Tirs à trois points réussis"],
  ["a3", "LT 3", "Tirs à trois points tentés"],
  ["ft", "LFR", "Lancers francs réussis"],
  ["fta", "LFT", "Lancers francs tentés"],
  ["ro", "RO", "Rebonds offensifs"],
  ["rd", "RD", "Rebonds défensifs"],
  ["points", "PTS", "Points totaux"],
];
const collator = new Intl.Collator("fr-CA", {
  numeric: true,
  sensitivity: "base",
});
const decimals = new Intl.NumberFormat("fr-CA", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const fold = (value) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr-CA");
export function display(key, value) {
  if (value == null || value === "") return "—";
  return ["ppg", "rpg", "pct2", "pct3", "pctft", "pointsForPerGame", "pointsAgainstPerGame"].includes(key)
    ? decimals.format(value)
    : String(value);
}
export const profileStats = [
  ["ppg", "Points par match"],
  ["points", "Points"],
  ["games", "Matchs joués"],
  ["m2", "Paniers à 2 points"],
  ["m3", "Paniers à 3 points"],
  ["ft", "Lancers francs réussis"],
  ["pctft", "Lancers francs (%)"],
];
function ranksByValue(players, key) {
  const values = players.map(p => p[key]).filter(value => value != null);
  values.sort((a, b) => b - a);
  const ranks = new Map();
  values.forEach((value, index) => {
    if (!ranks.has(value)) ranks.set(value, index + 1);
  });
  return ranks;
}
export function categoryLeaders(players, key) {
  const eligible = players.filter(p =>
    p[key] != null && (key !== "pctft" || p.fta > 0),
  );
  if (key === "ppg") {
    return eligible.sort((a, b) => a.rank - b.rank).slice(0, 10)
      .map(player => ({ player, rank: player.rank }));
  }
  const positions = ranksByValue(eligible, key);
  return eligible.sort((a, b) => b[key] - a[key] || a.rank - b.rank)
    .slice(0, 10).map(player => ({ player, rank: positions.get(player[key]) }));
}
export function profileRanks(players) {
  const ranks = new Map(players.map(p => [p.id, { ppg: p.rank }]));
  for (const [key] of profileStats) {
    if (key === "ppg") continue;
    const positions = ranksByValue(players, key);
    for (const p of players) ranks.get(p.id)[key] = positions.get(p[key]);
  }
  return ranks;
}
export function selectRows(players, { limit, search, team, key, direction }) {
  const terms = fold(search.trim()).split(/\s+/);
  const statSort = !["ppg", "rank", "name", "team", "number"].includes(key);
  const compare = (a, b, order) => {
    if (a[key] == null || b[key] == null)
      return Number(a[key] == null) - Number(b[key] == null) || a.rank - b.rank;
    const delta = typeof a[key] === "number"
      ? a[key] - b[key]
      : collator.compare(a[key], b[key]);
    return order * delta || a.rank - b.rank;
  };
  const rows = players.filter(
    (p) =>
      (limit === "all" || p.rank <= Number(limit)) &&
      (!team || p.teamId === team) &&
      terms.every((term) => fold(p.name).includes(term)),
  );
  rows.sort((a, b) => compare(a, b, direction));
  if (!statSort) return rows;
  const positions = ranksByValue(players, key);
  return rows.map(p => ({ ...p, tableRank: positions.get(p[key]) ?? null }));
}
export function tableValue(player, key) {
  return key === "rank" && "tableRank" in player ? player.tableRank : player[key];
}
export function csv(rows) {
  const escape = (value) => {
    let s = String(value);
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const lines = [
    columns.map((c) => c[1]),
    ...rows.map((p) =>
      columns.map(([key]) => {
        const value = tableValue(p, key);
        return value == null ? "" : display(key, value);
      }),
    ),
  ];
  return (
    "\uFEFF" +
    lines.map((line) => line.map(escape).join(";")).join("\r\n") +
    "\r\n"
  );
}
