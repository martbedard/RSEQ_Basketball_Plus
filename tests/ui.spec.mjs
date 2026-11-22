import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("le rang du tableau et du CSV suit la statistique triée", async ({ page }) => {
  const data = JSON.parse(await readFile(new URL("../archives/2026-11.json", import.meta.url), "utf8"));
  await page.route("**/data.json", route => route.fulfill({ json: data }));
  await page.goto("/#statistiques");
  const row = page.getByRole("row").filter({ hasText: "Isaac Bédard" });
  const rank = row.locator('td[data-key="rank"]');
  await expect(rank).toHaveText("23");
  const twos = page.getByRole("button", { name: "Trier par tirs à deux points réussis" });
  await twos.click();
  await expect(rank).toHaveText("4");
  await expect(page.locator("#body tr").nth(4)).toContainText("Isaac Bédard");
  const gabriel = page.getByRole("row").filter({ hasText: "Gabriel Gauthier" });
  await expect(gabriel.locator('td[data-key="rank"]')).toHaveText("4");
  await expect(page.locator("#body tr").nth(5).locator('td[data-key="rank"]')).toHaveText("6");
  await row.getByRole("button").click();
  const stat = page.getByRole("dialog").locator("dl > div").filter({ hasText: "Paniers à 2 points" });
  await expect(stat.locator(".stat-rank")).toHaveText("Rang (4)");
  await page.getByRole("button", { name: "Fermer la fiche" }).click();
  await twos.click();
  await page.getByLabel("Rechercher un joueur").fill("Isaac Bédard");
  await expect(rank).toHaveText("4");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exporter/ }).click();
  expect(await readFile(await (await download).path(), "utf8")).toContain('"4";"Isaac Bédard"');
  await page.getByRole("button", { name: "Trier par points par match" }).click();
  await expect(rank).toHaveText("23");
});

test("la source officielle s’ouvre dans un nouvel onglet", async ({ page, context }) => {
  const officialUrl = "https://www.rseq-stats.ca/collegial/ne/basketball-m-d2/";
  await context.route(officialUrl, (route) => route.fulfill({ body: "RSEQ" }));
  await page.goto("/");
  const rankingUrl = page.url();
  const popupOpened = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Source officielle", exact: true }).click();
  const popup = await popupOpened;
  await expect(popup).toHaveURL(officialUrl);
  await expect(page).toHaveURL(rankingUrl);
});

test("les noms des équipes ouvrent leur fiche RSEQ dans un nouvel onglet", async ({ page, context }) => {
  const archive = new URL("../archives/2026-11.json", import.meta.url);
  const data = JSON.parse(await readFile(archive, "utf8"));
  await page.route("**/data.json", (route) => route.fulfill({ json: data }));
  const teamUrl = (id) => "https://diffusion.rseq.ca/Default?Type=Team&TeamId=" + id;
  await context.route("https://diffusion.rseq.ca/**", (route) => route.fulfill({ body: "RSEQ" }));
  await page.goto("/#statistiques");
  await page.locator(".sources summary").click();
  for (const team of data.teams) {
    const rowLink = page.locator("#body").getByRole("link", { name: team.name, exact: true }).first();
    const sourceLink = page.locator("#sources").getByRole("link", { name: team.name + " · " + team.games + " MJ", exact: true });
    for (const link of [rowLink, sourceLink]) {
      await expect(link).toHaveAttribute("href", teamUrl(team.id));
      await expect(link).toHaveAttribute("target", "_blank");
    }
  }
  const leader = data.players[0];
  const leaderLink = page.locator("#leader").getByRole("link", { name: leader.team, exact: true });
  await expect(leaderLink).toHaveAttribute("href", teamUrl(leader.teamId));
  const popupOpened = page.waitForEvent("popup");
  await leaderLink.click();
  const popup = await popupOpened;
  await expect(popup).toHaveURL(teamUrl(leader.teamId));
  await popup.close();
  await page.getByRole("button", { name: leader.name, exact: true }).click();
  const profileLink = page.getByRole("dialog").getByRole("link");
  await expect(profileLink).toHaveText(leader.team);
  await expect(profileLink).toHaveAttribute("href", teamUrl(leader.teamId));
  await expect(profileLink).toHaveAttribute("target", "_blank");
});

test("un onglet ouvert affiche la nouvelle extraction dans les cinq minutes", async ({ page, request }) => {
  const data = await (await request.get("/data.json")).json();
  await page.clock.install();
  await page.route("**/data.json", (route) => route.fulfill({ json: data }));
  await page.goto("/#statistiques");
  const footerDetails = page.getByRole("contentinfo").locator(".footer-details");
  await expect(footerDetails).toContainText("Classement indépendant · Données du RSEQ");
  const timestamp = footerDetails.locator("#updated");
  await expect(timestamp).toHaveAttribute("datetime", data.updated);
  data.updated = new Date(Date.parse(data.updated) + 3600000).toISOString();
  await page.clock.fastForward("05:00");
  await expect(timestamp).toHaveAttribute("datetime", data.updated);
});

test("la fiche reprend les paniers et lancers francs réussis du classement", async ({ page }) => {
  const archive = new URL("../archives/2026-11.json", import.meta.url);
  const data = JSON.parse(await readFile(archive, "utf8"));
  await page.route("**/data.json", (route) => route.fulfill({ json: data }));
  await page.goto("/#statistiques");
  const row = page.getByRole("row").filter({ hasText: "Christ-Ariel Oulaï" });
  await row.getByRole("button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("dt")).toHaveText([
    "Points par match",
    "Points",
    "Matchs joués",
    "Paniers à 2 points",
    "Paniers à 3 points",
    "Lancers francs réussis",
    "Lancers francs (%)",
  ]);
  for (const [key, label] of [
    ["m2", "Paniers à 2 points"],
    ["m3", "Paniers à 3 points"],
    ["ft", "Lancers francs réussis"],
  ]) {
    const count = await row.locator(`td[data-key="${key}"]`).innerText();
    const stat = dialog.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) });
    await expect(stat.locator("dd strong")).toHaveText(count);
  }
  const close = dialog.getByRole("button", { name: "Fermer la fiche" });
  const stats = await dialog.locator("dl").boundingBox();
  expect((await close.boundingBox()).y).toBeGreaterThanOrEqual(stats.y + stats.height);
  await close.click();
  await expect(dialog).toBeHidden();
});

test("les valeurs et les rangs restent alignés dans la fiche après filtrage", async ({ page }) => {
  const data = JSON.parse(await readFile(new URL("../archives/2026-11.json", import.meta.url), "utf8"));
  await page.route("**/data.json", route => route.fulfill({ json: data }));
  await page.goto("/#statistiques");
  await page.getByLabel("Rechercher un joueur").fill("Isaac Bédard");
  await page.getByRole("button", { name: "Isaac Bédard", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#profile-stats + .rank-legend")).toBeVisible();
  await expect(dialog.locator(".stat-rank")).toHaveText(
    [23, 9, 1, 4, 23, 19, 13].map(rank => `Rang (${rank})`),
  );
  for (const selector of ["dd strong", ".stat-rank"]) {
    const edges = await dialog.locator(selector).evaluateAll(nodes =>
      nodes.map(node => node.getBoundingClientRect().right),
    );
    expect(Math.max(...edges) - Math.min(...edges)).toBeLessThan(1);
  }
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
});

test("seul un clic ou un toucher à l’extérieur ferme la fiche", async ({ page, hasTouch }) => {
  await page.goto("/#statistiques");
  const player = page.locator("#body tr").first().getByRole("button");
  await player.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading").click();
  await dialog.click({ position: { x: 8, y: 8 } });
  await expect(dialog).toBeVisible();

  const { x, y, width } = await dialog.boundingBox();
  const outsideX = Math.floor(x + width / 2);
  const outsideY = Math.floor(y - 4);
  if (hasTouch) {
    await page.touchscreen.tap(outsideX, outsideY);
  } else {
    await page.mouse.move(x + 12, y + 12);
    await page.mouse.down();
    await page.mouse.move(outsideX, outsideY);
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    await page.mouse.click(outsideX, outsideY);
  }
  await expect(dialog).toBeHidden();
  await expect(player).toBeFocused();
});

test("les fiches de Limoilou chargent les portraits par numéro de maillot", async ({ page }) => {
  const archive = new URL("../archives/2026-11.json", import.meta.url);
  const data = JSON.parse(await readFile(archive, "utf8"));
  await page.route("**/data.json", (route) => route.fulfill({ json: data }));
  await page.goto("/#statistiques");
  await page.getByRole("button", { name: "Tous", exact: true }).click();
  const dialog = page.getByRole("dialog");
  for (const player of data.players.filter((p) => p.team === "Limoilou")) {
    await page.getByRole("button", { name: player.name, exact: true }).click();
    await expect(dialog.getByRole("heading")).toHaveText(`${player.name} #${player.number}`);
    const portrait = dialog.getByRole("img", { name: player.name, exact: true });
    await expect(portrait).toBeVisible();
    await expect(portrait).toHaveAttribute("src", `./portraits/limoilou/2026-27/${player.number}.jpg`);
    await dialog.getByRole("button", { name: "Fermer la fiche" }).click();
  }
});

test("portrait à l’ouverture, changement de joueur et photo indisponible", async ({ page }) => {
  const archive = new URL("../archives/2026-11.json", import.meta.url);
  const data = JSON.parse(await readFile(archive, "utf8"));
  delete data.players.find((p) => p.name === "Yohann Keenania Zabavy").number;
  await page.route("**/data.json", (route) => route.fulfill({ json: data }));
  let requests = 0;
  await page.route("https://dynamiques.csfoy.ca/**", (route) => {
    requests++;
    if (!route.request().url().includes("csm_bedard_isaac_")) return route.abort();
    return route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"/>',
    });
  });

  await page.goto("/#statistiques");
  await page.getByRole("button", { name: "Tous", exact: true }).click();
  expect(requests).toBe(0);
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Isaac Bédard", exact: true }).click();
  await expect(dialog.getByRole("heading")).toHaveText("Isaac Bédard #8");
  await expect(dialog.getByRole("img", { name: "Isaac Bédard" })).toBeVisible();
  await dialog.getByRole("button", { name: "Fermer la fiche" }).click();

  await page.getByRole("button", { name: "Yohann Keenania Zabavy" }).click();
  await expect(dialog.getByRole("heading")).toHaveText("Yohann Keenania Zabavy");
  await expect(dialog.locator("img")).toHaveCount(0);
  await expect(dialog).toContainText("Points par match");
  await dialog.getByRole("button", { name: "Fermer la fiche" }).click();

  const failed = page.waitForEvent("requestfailed", (req) => req.url().includes("csm_bolduc_alexis_"));
  await page.getByRole("button", { name: "Alexis Bolduc" }).click();
  await failed;
  await expect(dialog.locator("img")).toBeHidden();
  await expect(dialog).toContainText("Points par match");
});

test("classement officiel, sélections, fiche, CSV et défilement", async ({
  page,
  request,
}, info) => {
  const data = await (await request.get("/data.json")).json();
  await page.goto("/#statistiques");
  const rows = page.locator("#body tr");
  const allPlayers = page.getByRole("button", { name: "Tous", exact: true });
  const teamFilter = page.getByLabel("Filtrer par équipe");
  const lastPlayer = data.players.at(-1);
  const teamPlayers = data.players.filter((p) => p.teamId === lastPlayer.teamId);
  await expect(allPlayers).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(data.players.length);
  await expect(rows.first()).toContainText(data.players[0].name);
  for (const n of [10, 25, 50]) {
    await page.getByRole("button", { name: "Top " + n, exact: true }).click();
    await expect(rows).toHaveCount(Math.min(n, data.players.length));
    await teamFilter.selectOption(lastPlayer.teamId);
    await expect(allPlayers).toHaveAttribute("aria-pressed", "true");
    await expect(rows.locator('td[data-key="name"]')).toHaveText(teamPlayers.map((p) => p.name));
    await teamFilter.selectOption("");
    await expect(rows).toHaveCount(data.players.length);
  }
  const p = data.players[0];
  await teamFilter.selectOption(p.teamId);
  await page.getByLabel("Rechercher un joueur").fill(p.name);
  await rows.first().getByRole("button").click();
  await expect(page.getByRole("dialog")).toContainText(p.name);
  await page.getByRole("button", { name: "Fermer la fiche" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exporter/ }).click();
  expect(await readFile(await (await downloaded).path(), "utf8")).toContain(
    p.name,
  );
  await page.getByLabel("Rechercher un joueur").fill("");
  await teamFilter.selectOption("");
  await page
    .getByRole("button", { name: "Trier par points par match", exact: true })
    .click();
  expect(await rows.first().innerText()).toContain(
    data.players.filter((x) => x.ppg === data.players.at(-1).ppg)[0].name,
  );
  if (info.project.name === "téléphone") {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const scroll = page.locator("#all-stats .scroll");
    expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      true,
    );
    await scroll.evaluate((el) => (el.scrollLeft = 300));
    expect(
      await rows
        .first()
        .locator("td")
        .nth(1)
        .evaluate((el) => el.getBoundingClientRect().left),
    ).toBeLessThan(100);
  }
});
test("chargement, erreur et affichage d’une ancienne vérification sans avertissement", async ({
  page,
  request,
}) => {
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route("**/data.json", async (route) => {
    await gate;
    await route.fulfill({ status: 404, body: "" });
  });
  await page.goto("/#statistiques");
  await expect(page.getByRole("status")).toContainText("Chargement");
  release();
  await expect(page.getByRole("status")).toContainText(
    "première actualisation",
  );
  await page.unrouteAll();
  await page.route("**/data.json", (route) =>
    route.fulfill({ status: 500, body: "" }),
  );
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Impossible");
  await page.unrouteAll();
  const data = await (await request.get("/data.json")).json();
  data.updated = "2020-01-01T00:00:00Z";
  await page.route("**/data.json", (route) => route.fulfill({ json: data }));
  await page.reload();
  await expect(page.locator("#sync-status")).toHaveText("Dernière vérification auprès du RSEQ");
  await expect(page.locator("#sync-status")).not.toHaveAttribute("data-error");
  await expect(page.locator("#updated")).toHaveAttribute("datetime", data.updated);
});

test("les sept classements par catégorie et les fiches utilisent les données de la ligue", async ({ page }, info) => {
  const data = JSON.parse(await readFile(new URL("../archives/2026-11.json", import.meta.url)));
  await page.route("**/data.json", route => route.fulfill({ json: data }));
  await page.route("https://dynamiques.csfoy.ca/**", route => route.abort());
  await page.goto("/#meneurs", { waitUntil: "domcontentloaded" });
  const groups = page.locator("#boards section");
  await expect(groups).toHaveCount(3);
  const stats = [["ppg", "points"], ["m2", "m3"], ["ft", "fta", "pctft"]];
  for (const [i, keys] of stats.entries()) {
    const panel = groups.nth(i);
    for (const key of keys) {
      const button = panel.locator('[data-stat="' + key + '"]');
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      const expected = data.players.filter(p => p[key] != null && (key !== "pctft" || p.fta > 0))
        .sort((a, b) => b[key] - a[key] || a.rank - b.rank).slice(0, 10);
      await expect(panel.locator(".board-player strong")).toHaveText(expected.map(p => p.name));
      if (key === "pctft") {
        await expect(panel.locator(".board-value small")).toHaveText(expected.map(p => p.ft + "/" + p.fta));
      }
    }
  }
  await expect(groups.first().locator('[data-stat="points"]')).toHaveAttribute("aria-pressed", "true");
  const baskets = groups.nth(1);
  await baskets.getByRole("button", { name: "LR2", exact: true }).click();
  const isaac = baskets.locator(".board-row").filter({ hasText: "Isaac Bédard" });
  await isaac.scrollIntoViewIfNeeded();
  await expect(isaac.locator(".board-avatar img")).toHaveCount(0);
  await expect(isaac.locator(".board-avatar")).toHaveText("IB");
  const first = baskets.locator(".board-row").first();
  await expect.poll(() => first.locator("img").evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await first.click();
  await expect(page.getByRole("dialog")).toContainText("Christ-Ariel Oulaï");
  await page.getByRole("button", { name: "Fermer la fiche" }).click();
  const left = await groups.first().boundingBox(), next = await baskets.boundingBox();
  if (info.project.name === "téléphone") {
    expect(next.y).toBeGreaterThanOrEqual(left.y + left.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } else {
    expect(next.y).toBe(left.y);
    expect(next.x).toBeGreaterThan(left.x);
  }
});

test("les liens de vue se copient et la navigation conserve les filtres", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/#statistiques");
  const p = (await (await page.request.get("/data.json")).json()).players[0];
  await page.getByRole("button", { name: "Top 10", exact: true }).click();
  await page.getByLabel("Filtrer par équipe").selectOption(p.teamId);
  await page.getByLabel("Rechercher un joueur").fill(p.name);
  await page.getByRole("button", { name: "Trier par points totaux" }).click();
  for (const [label, suffix] of [["Statistiques Individuelles", "#statistiques"], ["Classement", "#classement"], ["Meneurs par catégorie", "#meneurs"]]) {
    const link = page.getByRole("link", { name: label, exact: true });
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(link).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Copier le lien" }).click();
    await expect(page.locator("#copy-feedback")).toHaveText("Lien copié");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(baseURL + "/" + suffix);
    const fresh = await context.newPage();
    await fresh.goto(copied, { waitUntil: "domcontentloaded" });
    await expect(fresh.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    await fresh.close();
  }
  await expect(page.locator("#boards li")).toHaveCount(30);
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Classement des équipes");
  await page.goBack();
  await expect(page.locator("#body tr")).toHaveCount(1);
  await expect(page.getByLabel("Rechercher un joueur")).toHaveValue(p.name);
  await expect(page.getByLabel("Filtrer par équipe")).toHaveValue(p.teamId);
  await expect(page.getByRole("button", { name: "Tous", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('#head th[data-key="points"]')).toHaveAttribute("aria-sort", "descending");
  await page.goForward();
  await page.goForward();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Meneurs par catégorie");
});

test("le classement affiche les résultats du RSEQ et les points par match", async ({ page }) => {
  const { standings } = await (await page.request.get("/data.json")).json();
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Vue des statistiques" }).getByRole("link")).toHaveText([
    "Classement", "Calendrier", "Statistiques Individuelles", "Meneurs par catégorie",
  ]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Classement des équipes");
  await expect(page.getByRole("link", { name: "Classement", exact: true })).toHaveAttribute("aria-current", "page");
  const table = page.getByRole("table", { name: "Classement des équipes en saison régulière" });
  const rows = table.locator("tbody tr");
  const perGame = new Intl.NumberFormat("fr-CA", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  await expect(rows).toHaveCount(8);
  await expect(table.locator('th[data-key="position"]')).toHaveAttribute("aria-sort", "ascending");
  for (const [i, team] of standings.entries()) {
    await expect(rows.nth(i).getByRole("cell")).toHaveText([
      team.position, team.name, team.games, team.wins, team.losses, team.pointsFor,
      team.pointsAgainst,
      team.games ? perGame.format(team.pointsFor / team.games) : "—",
      team.games ? perGame.format(team.pointsAgainst / team.games) : "—",
      team.average, team.difference, team.points,
    ].map(String));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const tableLayout = await table.evaluate(element => {
    const textRight = node => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect().right;
    };
    const [rank, team, ...stats] = element.tBodies[0].rows[0].cells;
    const statHeaders = Array.from(element.tHead.rows[0].cells).slice(2);
    const offsets = statHeaders.map((header, index) =>
      Math.abs(textRight(header.querySelector("abbr")) - textRight(stats[index])));
    const scroller = element.parentElement;
    scroller.scrollLeft = scroller.scrollWidth;
    const rankBox = rank.getBoundingClientRect();
    return {
      maxOffset: Math.max(...offsets),
      pinnedStart: Math.abs(rankBox.left - scroller.getBoundingClientRect().left),
      pinnedGap: Math.abs(rankBox.right - team.getBoundingClientRect().left),
    };
  });
  expect(tableLayout.maxOffset).toBeLessThan(1);
  expect(tableLayout.pinnedStart).toBeLessThan(1);
  expect(tableLayout.pinnedGap).toBeLessThan(1);
  const old = JSON.parse(await readFile(new URL("../archives/2026-11.json", import.meta.url)));
  await page.route("**/data.json", route => route.fulfill({ json: old }));
  await page.reload();
  await expect(page.getByRole("status")).toContainText("indisponible pour cette extraction");
  await expect(table).toBeHidden();
  await page.getByRole("link", { name: "Statistiques Individuelles" }).click();
  await expect(page.locator("#body tr")).toHaveCount(old.players.length);
});

test("le calendrier partage les matchs et résultats de la saison régulière", async ({ page }) => {
  const data = await (await page.request.get("/data.json")).json();
  await page.goto("/");
  await page.getByRole("link", { name: "Calendrier", exact: true }).click();
  await expect(page).toHaveURL(/#calendrier$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Calendrier");
  await expect(page.getByRole("link", { name: "Calendrier", exact: true })).toHaveAttribute("aria-current", "page");
  const schedule = page.getByRole("region", { name: "Calendrier", exact: true });
  const rows = schedule.locator("tbody tr");
  expect(data.games.length).toBeGreaterThan(0);
  await expect(rows).toHaveCount(data.games.length);
  const months = [...new Set(data.games.map(game => game.date?.slice(0, 7)))];
  await expect(schedule.getByRole("heading", { level: 2 })).toHaveCount(months.length);
  const monthName = new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric", timeZone: "UTC" });
  for (const month of months) {
    const label = month ? monthName.format(new Date(month + "-01")) : "Dates à confirmer";
    const table = schedule.getByRole("table", { name: label, exact: true });
    await expect(table.locator("tbody tr")).toHaveCount(
      data.games.filter(game => game.date?.slice(0, 7) === month).length,
    );
  }
  const dates = await schedule.locator("time").evaluateAll(nodes => nodes.map(node => node.dateTime));
  expect(dates).toEqual([...dates].sort());
  const scored = data.games.findIndex(game => game.score);
  const game = data.games[scored];
  const names = new Map(data.teams.map(team => [team.id, team.name]));
  const cells = rows.nth(scored).getByRole("cell");
  await expect(cells.nth(0)).toContainText(game.venue);
  for (const [index, team] of [[1, game.visitor], [2, game.home]]) {
    const link = cells.nth(index).getByRole("link", { name: names.get(team), exact: true });
    await expect(link).toHaveAttribute("href", `https://diffusion.rseq.ca/Default?Type=Team&TeamId=${team}`);
    await expect(link).toHaveAttribute("target", "_blank");
  }
  await expect(cells.nth(3).getByRole("link", { name: game.score.join(" – ") }))
    .toHaveAttribute("href", `https://diffusion.rseq.ca/Default.aspx?Type=Game&GameId=${game.id}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(rows).toHaveCount(data.games.length);
  const { games, ...old } = data;
  await page.route("**/data.json", route => route.fulfill({ json: old }));
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Le calendrier est indisponible");
  await expect(page.getByRole("button", { name: "Aujourd’hui" })).toBeDisabled();
});

test("Aujourd’hui mène au premier match de la date la plus proche au Québec", async ({ page }) => {
  const data = await (await page.request.get("/data.json")).json();
  const dates = ["2026-11-21", "2026-11-23", "2026-11-23", "2026-11-24"];
  data.games = data.games.slice(0, dates.length).map((game, index) => ({ ...game, date: dates[index] }));
  await page.route("**/data.json", route => route.fulfill({ json: data }));
  await page.goto("/");
  const today = page.getByRole("button", { name: "Aujourd’hui" });
  await expect(today).toBeHidden();
  await page.getByRole("link", { name: "Calendrier", exact: true }).click();
  await expect(today).toBeEnabled();
  const rows = page.locator("#schedule-months tbody tr");
  for (const [now, expected] of [
    ["2026-11-24T04:30:00Z", 1],
    ["2026-11-22T17:00:00Z", 1],
    ["2026-11-25T17:00:00Z", 3],
  ]) {
    await page.clock.setFixedTime(new Date(now));
    await today.click();
    await expect(rows.nth(expected)).toBeFocused();
    await expect(rows.nth(expected)).toBeInViewport();
    await expect(page).toHaveURL(/#calendrier$/);
  }
});

test("les colonnes du classement se trient dans les deux sens", async ({ page }) => {
  const data = await (await page.request.get("/data.json")).json();
  const { standings } = data;
  const teamWithoutGames = standings.at(-1);
  Object.assign(teamWithoutGames, { games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 });
  await page.route("**/data.json", route => route.fulfill({ json: data }));
  await page.goto("/");
  await expect(page.locator("#standings-body tr:last-child td").filter({ hasText: /^—$/ })).toHaveCount(2);
  const positions = page.locator("#standings-body td:first-child");
  const keys = ["position", "name", "games", "wins", "losses", "pointsFor",
    "pointsAgainst", "pointsForPerGame", "pointsAgainstPerGame", "average", "difference", "points"];
  for (const key of keys) {
    const header = page.locator(`#standings-head th[data-key="${key}"]`);
    const button = header.getByRole("button");
    const directions = key === "name" ? [1, -1] : [-1, 1];
    for (const direction of directions) {
      if (key === "position") await button.press("Enter");
      else await button.click();
      await expect(header).toHaveAttribute("aria-sort", direction === 1 ? "ascending" : "descending");
      await expect(page.locator("#standings-head [aria-sort]")).toHaveCount(1);
      const expected = [...standings].sort((a, b) => {
        if (key.endsWith("PerGame")) {
          if (!a.games || !b.games) return Number(!a.games) - Number(!b.games) || a.position - b.position;
          const total = key === "pointsForPerGame" ? "pointsFor" : "pointsAgainst";
          return direction * (a[total] / a.games - b[total] / b.games) || a.position - b.position;
        }
        const order = key === "name" ? a.name.localeCompare(b.name, "fr-CA") : Number(a[key]) - Number(b[key]);
        return direction * order || a.position - b.position;
      });
      await expect(positions).toHaveText(expected.map(team => String(team.position)));
    }
  }
  await page.reload();
  await expect(positions).toHaveText(standings.map(team => String(team.position)));
});
