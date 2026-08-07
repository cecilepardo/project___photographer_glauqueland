const fs = require("fs-extra");
const path = require("path");
const glob = require("fast-glob");
const cheerio = require("cheerio");

const ROOT_DIR = __dirname;

async function updateProjectLinks() {
  try {
    console.log("🚀 Mise à jour des liens et des références CSS...\n");

    // 1. Mise à jour de index.html (Home / Hero)
    const homePath = path.join(ROOT_DIR, "index.html");
    if (await fs.pathExists(homePath)) {
      let homeHtml = await fs.readFile(homePath, "utf-8");
      homeHtml = homeHtml.replace(/index-2\.css/g, "home.css");
      homeHtml = homeHtml.replace(/index-2\.html/g, "map.html");
      await fs.writeFile(homePath, homeHtml, "utf-8");
      console.log("✅ index.html mis à jour (référence vers home.css et map.html)");
    }

    // 2. Mise à jour de map.html (ex index-2.html)
    const mapPath = path.join(ROOT_DIR, "map.html");
    if (await fs.pathExists(mapPath)) {
      let mapHtml = await fs.readFile(mapPath, "utf-8");
      mapHtml = mapHtml.replace(/index-2\.css/g, "map.css");

      // Transformer les liens href="lieu/" ou href="lieu/index.htm" en href="lieu/lieu.html"
      const $map = cheerio.load(mapHtml, { decodeEntities: false });
      $map("a").each((_, el) => {
        const href = $map(el).attr("href");
        if (href && !href.startsWith("http") && !href.startsWith("#")) {
          // Extraire le nom du dossier (ex: "absence/" ou "absence/index.htm" -> "absence")
          const folder = href.split("/").filter(Boolean)[0];
          if (folder) {
            $map(el).attr("href", `${folder}/${folder}.html`);
          }
        }
      });
      await fs.writeFile(mapPath, $map.html(), "utf-8");
      console.log("✅ map.html mis à jour (références vers les pages lieu.html)");
    }

    // 3. Mise à jour des 460 pages de lieux (liens connexes footer et CSS)
    const files = await glob("**/*.html", {
      cwd: ROOT_DIR,
      absolute: true,
      ignore: ["node_modules/**", "index.html", "map.html"],
    });

    for (const filePath of files) {
      let html = await fs.readFile(filePath, "utf-8");
      const $ = cheerio.load(html, { decodeEntities: false });

      // Mettre à jour les liens connexes dans le footer
      $(".related-links a").each((_, el) => {
        const href = $(el).attr("href");
        if (href && href.startsWith("../")) {
          const parts = href.split("/").filter(Boolean);
          // Si le lien est sous la forme "../nom-lieu/" ou "../nom-lieu/index.htm"
          if (parts.length >= 2) {
            const folderName = parts[1];
            $(el).attr("href", `../${folderName}/${folderName}.html`);
          }
        }
      });

      await fs.writeFile(filePath, $.html(), "utf-8");
    }

    console.log(`✅ ${files.length} pages de lieux mises à jour pour cibler leur dossier/lieu.html`);
    console.log("\n🎉 Tout est prêt pour le serveur local !");
  } catch (error) {
    console.error("❌ Erreur lors de la mise à jour :", error);
  }
}

updateProjectLinks();