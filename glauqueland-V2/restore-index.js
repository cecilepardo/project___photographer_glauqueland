const fs = require("fs-extra");
const path = require("path");
const glob = require("fast-glob");
const cheerio = require("cheerio");

// Dossier racine du projet
const ROOT_DIR = __dirname;

async function restoreIndexStructure() {
  try {
    console.log("🔄 1. Renomage des fichiers HTML de lieu en index.html...\n");

    // Récupérer tous les fichiers HTML situés dans les sous-dossiers (hors racine)
    const files = await glob("*/*.html", {
      cwd: ROOT_DIR,
      absolute: true,
      ignore: ["node_modules/**"],
    });

    let renamedCount = 0;

    for (const filePath of files) {
      const dirPath = path.dirname(filePath);
      const fileName = path.basename(filePath);
      const newPath = path.join(dirPath, "index.html");

      // Si le fichier ne s'appelle pas déjà index.html, on le renomme
      if (fileName !== "index.html") {
        await fs.rename(filePath, newPath);
        const folderName = path.basename(dirPath);
        console.log(`✅ ${folderName}/${fileName} ➔ ${folderName}/index.html`);
        renamedCount++;
      }
    }

    console.log(`\n🎉 ${renamedCount} fichier(s) renommé(s) en index.html.\n`);
    console.log("🔗 2. Mise à jour des liens dans map.html et le footer des lieux...\n");

    // A. Mise à jour des liens de la carte (map.html) vers /nom-lieu/
    const mapPath = path.join(ROOT_DIR, "map.html");
    if (await fs.pathExists(mapPath)) {
      const mapHtml = await fs.readFile(mapPath, "utf-8");
      const $map = cheerio.load(mapHtml, { decodeEntities: false });

      $map("a").each((_, el) => {
        const href = $map(el).attr("href");
        if (href && !href.startsWith("http") && !href.startsWith("#")) {
          // Récupérer uniquement le nom du dossier (ex: "absence/absence.html" -> "absence")
          const folder = href.split("/").filter(Boolean)[0];
          if (folder) {
            // Le slash final permet au serveur d'ouvrir directement index.html
            $map(el).attr("href", `${folder}/`);
          }
        }
      });

      await fs.writeFile(mapPath, $map.html(), "utf-8");
      console.log("✅ map.html : Liens mis à jour vers le format dossier ('lieu/')");
    }

    // B. Mise à jour des liens connexes dans le footer de chaque album
    const albumFiles = await glob("*/index.html", {
      cwd: ROOT_DIR,
      absolute: true,
      ignore: ["node_modules/**"],
    });

    for (const albumPath of albumFiles) {
      const htmlContent = await fs.readFile(albumPath, "utf-8");
      const $ = cheerio.load(htmlContent, { decodeEntities: false });

      $(".related-links a").each((_, el) => {
        const href = $(el).attr("href");
        if (href && href.startsWith("../")) {
          // Extraire le nom du lieu cible (ex: "../chat/chat.html" -> "chat")
          const parts = href.split("/").filter(Boolean);
          if (parts.length >= 2) {
            const targetFolder = parts[1];
            $(el).attr("href", `../${targetFolder}/`);
          }
        }
      });

      await fs.writeFile(albumPath, $.html(), "utf-8");
    }

    console.log(`✅ ${albumFiles.length} pages d'albums mises à jour pour les liens connexes.`);
    console.log("\n🚀 Tout est prêt ! Vous pouvez relancer : npx serve .");
  } catch (error) {
    console.error("❌ Erreur pendant la restauration :", error);
  }
}

restoreIndexStructure();