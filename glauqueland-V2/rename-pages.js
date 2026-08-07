const fs = require("fs-extra");
const path = require("path");
const glob = require("fast-glob");

const ROOT_DIR = __dirname;

async function renameToFolderName() {
  try {
    console.log("🔄 Renomage des fichiers HTML avec le nom de leur dossier...\n");

    const files = await glob("**/{index,INDEX}.{htm,html,HTM,HTML}", {
      cwd: ROOT_DIR,
      absolute: true,
      ignore: ["node_modules/**"],
    });

    let renamedCount = 0;

    for (const filePath of files) {
      const dirPath = path.dirname(filePath);
      const folderName = path.basename(dirPath);

      // On évite de toucher aux fichiers de la racine
      if (dirPath === ROOT_DIR) continue;

      const newPath = path.join(dirPath, `${folderName}.html`);

      if (filePath !== newPath) {
        await fs.rename(filePath, newPath);
        console.log(`✅ ${path.relative(ROOT_DIR, filePath)} ➔ ${folderName}/${folderName}.html`);
        renamedCount++;
      }
    }

    console.log(`\n🎉 Terminé ! ${renamedCount} fichier(s) renommé(s).`);
  } catch (error) {
    console.error("❌ Erreur :", error);
  }
}

renameToFolderName();