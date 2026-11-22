import { columns, display, profileStats, profileRanks, categoryLeaders, selectRows, tableValue, csv } from "./model.mjs?v=points-par-match";
import { portraits } from "./portraits.mjs";
const $ = (id) => document.getElementById(id);
const profileDialog = $("profile");
const state = { limit: "all", search: "", team: "", key: "ppg", direction: -1 };
let dataset,
  ranks,
  visible = [];
const dates = new Intl.DateTimeFormat("fr-CA", {
  timeZone: "America/Toronto",
  dateStyle: "medium",
  timeStyle: "short",
});
const gameDates = new Intl.DateTimeFormat("fr-CA", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});
const gameMonths = new Intl.DateTimeFormat("fr-CA", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
const quebecDate = new Intl.DateTimeFormat("fr-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function element(tag, text) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  return node;
}
function teamLink(id, name) {
  const link = element("a", name);
  link.href = "https://diffusion.rseq.ca/Default?Type=Team&TeamId=" + encodeURIComponent(id);
  link.target = "_blank";
  link.rel = "noopener";
  return link;
}
function onBackdrop(event) {
  if (event.target !== profileDialog) return false;
  const { left, right, top, bottom } = profileDialog.getBoundingClientRect();
  return event.clientX < left || event.clientX >= right ||
    event.clientY < top || event.clientY >= bottom;
}
let pressedOnBackdrop = false;
profileDialog.addEventListener("pointerdown", (event) => {
  pressedOnBackdrop = onBackdrop(event);
});
profileDialog.addEventListener("click", (event) => {
  if (pressedOnBackdrop && onBackdrop(event)) profileDialog.close();
  pressedOnBackdrop = false;
});
function profile(p) {
  $("profile-team").replaceChildren(teamLink(p.teamId, p.team), " · Rang " + p.rank);
  const number = String(p.number ?? "").trim();
  $("profile-name").textContent = number ? `${p.name} #${number}` : p.name;
  const portrait = $("profile-portrait");
  portrait.replaceChildren();
  portrait.hidden = true;
  if (portraits[p.id]) {
    const image = element("img");
    image.alt = p.name;
    image.onload = () => {
      if (image.parentNode === portrait) portrait.hidden = false;
    };
    portrait.append(image);
    image.src = portraits[p.id];
  }
  $("profile-stats").replaceChildren(
    ...profileStats.map(([key, label]) => {
      const item = element("div");
      const unit = key.startsWith("pct") && p[key] != null ? " %" : "";
      const value = element("dd");
      value.append(element("strong", display(key, p[key]) + unit));
      const rank = ranks.get(p.id)[key];
      if (rank != null) {
        const note = element("span", `(${rank})`);
        note.className = "stat-rank";
        const prefix = element("span", "Rang ");
        prefix.className = "sr";
        note.prepend(prefix);
        value.append(note);
      }
      item.append(element("dt", label), value);
      return item;
    }),
  );
  profileDialog.showModal();
}

function leaderEntry({ player, rank }, key) {
  const row = element("button");
  row.className = "board-row";
  row.onclick = () => profile(player);
  const initials = player.name.trim().split(/\s+/);
  const avatar = element("span", initials[0][0] + (initials.length > 1 ? initials.at(-1)[0] : ""));
  avatar.className = "board-avatar";
  avatar.setAttribute("aria-hidden", "true");
  if (portraits[player.id]) {
    const image = element("img");
    image.alt = "";
    image.loading = "lazy";
    image.onerror = () => image.remove();
    avatar.append(image);
    image.src = portraits[player.id];
  }
  const identity = element("span");
  identity.className = "board-player";
  identity.append(element("strong", player.name), element("small", player.team));
  const value = element("span", display(key, player[key]));
  value.className = "board-value";
  if (key === "pctft") value.append(" %", element("small", player.ft + "/" + player.fta));
  const position = element("span", rank);
  position.className = "board-rank";
  row.append(position, avatar, identity, value);
  const item = element("li");
  item.append(row);
  return item;
}

const groups = [
  ["Marqueurs", [["ppg", "PTS/MJ"], ["points", "PTS"]]],
  ["Paniers réussis", [["m2", "LR2"], ["m3", "LR3"]]],
  ["Lancers francs", [["ft", "LFR"], ["fta", "LFT"], ["pctft", "% lancers francs"]]],
];
const updateBoards = groups.map(([title, stats]) => {
  const panel = element("section"), controls = element("div"), list = element("ol");
  const heading = element("h2", title);
  heading.id = "group-" + stats[0][0];
  panel.setAttribute("aria-labelledby", heading.id);
  controls.className = "board-controls";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", "Statistique · " + title);
  const empty = element("p", "Aucune donnée disponible pour cette statistique.");
  empty.className = "notice";
  let selected = stats[0][0];
  function update() {
    const rows = categoryLeaders(dataset.players, selected);
    list.replaceChildren(...rows.map(row => leaderEntry(row, selected)));
    empty.hidden = rows.length > 0;
    for (const button of controls.children) {
      button.setAttribute("aria-pressed", String(button.dataset.stat === selected));
    }
  }
  for (const [key, label] of stats) {
    const button = element("button", label);
    button.dataset.stat = key;
    button.onclick = () => { selected = key; update(); };
    controls.append(button);
  }
  panel.append(heading, controls, list, empty);
  $("boards").append(panel);
  return update;
});

const views = [
  { hash: "#classement", section: $("standings-view"), link: $("standings-link"), title: "Classement des équipes" },
  { hash: "#calendrier", section: $("schedule-view"), link: $("schedule-link"), title: "Calendrier" },
  { hash: "#statistiques", section: $("all-stats"), link: $("all-link"), title: "Classement des marqueurs" },
  { hash: "#meneurs", section: $("leaders-view"), link: $("leaders-link"), title: "Meneurs par catégorie" },
];
const [standingsView, scheduleView, playersView, leadersView] = views;
const scheduleToday = $("schedule-today");

function showView() {
  const active = views.find(view => view.hash === location.hash) ?? standingsView;
  for (const view of views) {
    view.section.hidden = view !== active;
    if (view === active) view.link.setAttribute("aria-current", "page");
    else view.link.removeAttribute("aria-current");
  }
  $("leader").hidden = active !== playersView || !dataset;
  $("eligible-metric").hidden = active !== playersView && active !== leadersView;
  scheduleToday.hidden = active !== scheduleView;
  $("title").textContent = active.title;
  $("boards").hidden = !dataset;
  $("leaders-notice").hidden = Boolean(dataset);
  $("copy-feedback").textContent = "";
  $("share-url").hidden = true;
  if (active === leadersView && dataset) updateBoards.forEach(update => update());
}
// Real links also support opening a view in a new tab.
for (const { link } of views) {
  link.addEventListener("click", event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (location.href !== link.href) history.pushState(null, "", link.href);
    showView();
  });
}
window.addEventListener("hashchange", showView);
$("copy-view").onclick = async () => {
  const url = document.querySelector('.view-toolbar [aria-current="page"]').href;
  try {
    await navigator.clipboard.writeText(url);
    if (document.querySelector('.view-toolbar [aria-current="page"]').href === url) {
      $("share-url").hidden = true;
      $("copy-feedback").textContent = "Lien copié";
    }
  } catch {
    if (document.querySelector('.view-toolbar [aria-current="page"]').href !== url) return;
    const field = $("share-url");
    field.hidden = false;
    field.value = url;
    field.select();
    $("copy-feedback").textContent = "Lien à copier";
  }
};
scheduleToday.onclick = () => {
  const { year, month, day } = Object.fromEntries(
    quebecDate.formatToParts(new Date()).map(({ type, value }) => [type, value]),
  );
  const today = Date.parse(`${year}-${month}-${day}`);
  let nearest, nearestDate, distance = Infinity;
  for (const date of $("schedule-months").querySelectorAll("time")) {
    const gameDate = Date.parse(date.dateTime);
    const difference = Math.abs(gameDate - today);
    if (difference < distance || (difference === distance && gameDate > nearestDate)) {
      nearest = date;
      nearestDate = gameDate;
      distance = difference;
    }
  }
  if (nearest) {
    const row = nearest.closest("tr");
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: "center" });
  }
};
showView();

const standingsHeaders = [...$("standings-head").children];
const standingsSort = { key: "position", direction: 1 };
for (const header of standingsHeaders) {
  const { key } = header.dataset;
  header.firstElementChild.onclick = () => {
    if (standingsSort.key === key) standingsSort.direction *= -1;
    else standingsSort.direction = key === "position" || key === "name" ? 1 : -1;
    standingsSort.key = key;
    renderStandings();
  };
}

function renderStandings() {
  const { standings, teams } = dataset;
  const { key, direction } = standingsSort;
  const rows = standings?.length === teams.length ? standings.map(team => ({
    ...team,
    pointsForPerGame: team.games > 0 ? team.pointsFor / team.games : null,
    pointsAgainstPerGame: team.games > 0 ? team.pointsAgainst / team.games : null,
  })) : [];
  rows.sort((a, b) => {
    if (a[key] === null || b[key] === null) {
      return Number(a[key] === null) - Number(b[key] === null) || a.position - b.position;
    }
    const order = key === "name" ? a.name.localeCompare(b.name, "fr-CA") : a[key] - b[key];
    return direction * order || a.position - b.position;
  });
  for (const header of standingsHeaders) {
    if (header.dataset.key === key) {
      header.setAttribute("aria-sort", direction === 1 ? "ascending" : "descending");
    } else {
      header.removeAttribute("aria-sort");
    }
  }
  $("standings-body").replaceChildren(...rows.map(team => {
    const row = element("tr");
    for (const header of standingsHeaders) {
      const { key } = header.dataset;
      const cell = element("td");
      cell.dataset.key = key;
      if (key === "name") cell.append(teamLink(team.id, team.name));
      else cell.textContent = display(key, team[key]);
      row.append(cell);
    }
    return row;
  }));
  $("standings-scroll").hidden = !rows.length;
  $("standings-notice").hidden = Boolean(rows.length);
  $("standings-notice").textContent = "Le classement des équipes est indisponible pour cette extraction.";
}

function renderSchedule(teams) {
  const { games } = dataset;
  const names = new Map(teams.map(team => [team.id, team.name]));
  const sections = document.createDocumentFragment();
  const months = new Map();
  for (const game of games ?? []) {
    const month = game.date?.slice(0, 7);
    if (!months.has(month)) {
      const section = $("schedule-month-template").content.firstElementChild.cloneNode(true);
      const heading = section.querySelector("h2");
      heading.id = "schedule-month-" + (month ?? "unknown");
      heading.textContent = month ? gameMonths.format(new Date(game.date)) : "Dates à confirmer";
      section.setAttribute("aria-labelledby", heading.id);
      section.querySelector("table").setAttribute("aria-labelledby", heading.id);
      months.set(month, section.querySelector("tbody"));
      sections.append(section);
    }
    const row = element("tr");
    const details = element("td");
    if (game.date) {
      row.tabIndex = -1;
      const date = element("time", gameDates.format(new Date(game.date)));
      date.dateTime = game.date;
      details.append(date);
    } else {
      details.append("Date à confirmer");
    }
    if (game.time) {
      const [hours, minutes] = game.time.split(":");
      details.append(` · ${Number(hours)} h${minutes === "00" ? "" : " " + minutes}`);
    }
    if (game.venue) details.append(element("small", game.venue));
    const visitor = element("td");
    visitor.append(teamLink(game.visitor, names.get(game.visitor)));
    const home = element("td");
    home.append(teamLink(game.home, names.get(game.home)));
    const result = element("td");
    if (game.score) {
      const link = element("a", game.score.join(" – "));
      link.href = "https://diffusion.rseq.ca/Default.aspx?Type=Game&GameId=" + encodeURIComponent(game.id);
      link.target = "_blank";
      link.rel = "noopener";
      result.append(link);
    } else {
      result.textContent = game.cancelled ? "Annulé" : "—";
    }
    row.append(details, visitor, home, result);
    months.get(month).append(row);
  }
  $("schedule-months").replaceChildren(sections);
  scheduleToday.disabled = !games?.some(game => game.date);
  $("schedule-notice").hidden = Boolean(games?.length);
  $("schedule-notice").textContent = games
    ? "Aucun match au calendrier."
    : "Le calendrier est indisponible pour cette extraction.";
}

function render() {
  if (!dataset) return;
  visible = selectRows(dataset.players, state);
  $("body").replaceChildren(
    ...visible.map((p) => {
      const row = element("tr");
      for (const [key] of columns) {
        const cell = element("td");
        cell.dataset.key = key;
        if (key === "name") {
          const button = element("button", p.name);
          button.className = "name";
          button.addEventListener("click", () => profile(p));
          cell.append(button);
        } else if (key === "team") {
          cell.append(teamLink(p.teamId, p.team));
        } else cell.textContent = display(key, tableValue(p, key));
        row.append(cell);
      }
      return row;
    }),
  );
  for (const th of $("head").children) {
    const active = th.dataset.key === state.key;
    th.setAttribute(
      "aria-sort",
      active ? (state.direction === 1 ? "ascending" : "descending") : "none",
    );
    th.firstChild.textContent =
      th.dataset.label + (active ? (state.direction === 1 ? " ↑" : " ↓") : "");
  }
  document
    .querySelectorAll("[data-limit]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.limit === state.limit)),
    );
  $("results").textContent = visible.length + " joueurs affichés";
  $("notice").hidden = visible.length > 0;
  $("notice").textContent = "Aucun joueur ne correspond à cette sélection.";
  $("csv").disabled = !visible.length;
}
for (const [key, label, description] of columns) {
  const th = element("th"),
    button = element("button", label);
  th.scope = "col";
  th.dataset.key = key;
  th.dataset.label = label;
  button.title = description;
  button.setAttribute("aria-label", "Trier par " + description.toLowerCase());
  button.onclick = () => {
    state.direction =
      state.key === key
        ? -state.direction
        : ["rank", "name", "team", "number"].includes(key)
          ? 1
          : -1;
    state.key = key;
    render();
  };
  th.append(button);
  $("head").append(th);
}
document.querySelectorAll("[data-limit]").forEach(
  (b) =>
    (b.onclick = () => {
      state.limit = b.dataset.limit;
      render();
    }),
);
$("search").oninput = (e) => {
  state.search = e.target.value;
  render();
};
$("team").onchange = (e) => {
  state.team = e.target.value;
  if (state.team) state.limit = "all";
  render();
};
$("csv").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([csv(visible)], { type: "text/csv;charset=utf-8" }),
  );
  const link = element("a");
  link.href = url;
  link.download = "RSEQ-D2-classement.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};
let loading = false;
async function load() {
  if (loading) return;
  loading = true;
  try {
    const response = await fetch("./data.json", { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    if (
      data.season !== "2026-2027" ||
      data.teams?.length !== 8 ||
      !data.players?.length ||
      !Number.isFinite(Date.parse(data.updated))
    )
      throw new Error("incomplet");
    if (dataset?.updated === data.updated) return;
    dataset = data;
    ranks = profileRanks(data.players);
    const teams = [...data.teams].sort((a, b) =>
      a.name.localeCompare(b.name, "fr-CA"),
    );
    $("team").replaceChildren(
      new Option("Toutes les équipes", ""),
      ...teams.map((t) => new Option(t.name, t.id)),
    );
    $("team").value = state.team;
    $("sources").replaceChildren(
      ...teams.map((t) => {
        const li = element("li");
        li.append(teamLink(t.id, t.name + " · " + t.games + " MJ"));
        return li;
      }),
    );
    $("teams").textContent = teams.length;
    $("eligible").textContent = data.players.length;
    $("sync-status").textContent = "Dernière vérification auprès du RSEQ";
    $("sync-status").removeAttribute("data-error");
    $("updated").dateTime = data.updated;
    $("updated").textContent =
      dates.format(new Date(data.updated)) + " (Québec)";
    const leader = data.players[0];
    $("leader-name").textContent = leader.name;
    $("leader-line").replaceChildren(
      teamLink(leader.teamId, leader.team),
      " · " + display("ppg", leader.ppg) + " PTS/MJ",
    );
    render();
    renderStandings();
    renderSchedule(teams);
    showView();
  } catch (error) {
    if (!dataset) {
      $("sync-status").setAttribute("data-error", "");
      $("sync-status").textContent = "Données indisponibles";
      $("notice").textContent =
        error.message === "404"
          ? "En attente de la première actualisation complète des huit équipes."
          : "Impossible de charger le classement. Une nouvelle tentative aura lieu automatiquement.";
      $("leaders-notice").textContent = $("notice").textContent;
      $("standings-notice").textContent = $("notice").textContent;
      $("schedule-notice").textContent = error.message === "404"
        ? $("notice").textContent
        : "Impossible de charger le calendrier. Une nouvelle tentative aura lieu automatiquement.";
    }
  } finally {
    loading = false;
  }
}
load();
function loadIfVisible() {
  if (document.visibilityState === "visible") load();
}
setInterval(loadIfVisible, 5 * 60000);
document.addEventListener("visibilitychange", loadIfVisible);
