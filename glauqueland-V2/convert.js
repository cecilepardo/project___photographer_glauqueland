const fs = require('fs-extra');
const path = require('path');
const glob = require('fast-glob');
const cheerio = require('cheerio');

// Configuration des dossiers
const INPUT_DIR = __dirname; 
const OUTPUT_DIR = path.join(__dirname, 'dist'); // Les fichiers nettoyés iront dans "dist/"

/**
 * Nettoie le texte en retirant les retours à la ligne superflus et espaces multiples
 */
function cleanText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Traite un fichier HTML d'origine et génère la version restructurée
 */
async function processFile(filePath) {
  const relativePath = path.relative(INPUT_DIR, filePath);
  
  // Ignorer les fichiers de la racine (index.html, index-2.html) et le dossier de sortie
  if (!relativePath.includes(path.sep) || relativePath.startsWith('dist')) {
    return;
  }

  const htmlContent = await fs.readFile(filePath, 'utf-8');
  const $ = cheerio.load(htmlContent, { decodeEntities: false });

  // 1. Extraire les métadonnées
  const pageTitle = cleanText($('title').text()) || "Glauque Land";
  const metaDescription = $('meta[name="description"]').attr('content') || "Urbex : Glauque-Land - Lieux abandonnés en France et Europe";
  const metaKeywords = $('meta[name="keywords"]').attr('content') || "urbex, exploration urbaine";
  const ogImage = $('meta[property="og:image"]').attr('content') || "";
  const ogUrl = $('meta[property="og:url"]').attr('content') || "";

  // Déduire le titre du lieu (sans le préfixe "Glauque Land > ")
  const locationTitle = pageTitle.replace(/^Glauque\s+Land\s*>&nbsp;|\s*>&nbsp;|\s*>\s*/i, '').trim();

  // 2. Extraire la bannière de titre et la boîte d'avertissement
  const titleBannerImg = $('img[src$=".gif"]').first().attr('src') || "";
  
  // Trouver le texte d'avertissement (souvent caractérisé par "Important :" ou "style1")
  let warningText = "";
  $('table, p, span').each((_, el) => {
    const text = $(el).text();
    if (text.includes('Important :') && !warningText) {
      warningText = cleanText(text);
    }
  });

  // 3. Extraire le contenu principal (textes et images dans l'ordre)
  const bodyElements = [];
  
  // On parcourt les tables et paragraphes du body
  $('body').find('table, p').each((_, el) => {
    const $el = $(el);
    
    // Ignorer le header déjà traité et le footer
    if ($el.find('img[src*="contact.gif"], img[src*="lien"]').length > 0) return;
    if ($el.text().includes('Important :') && warningText) return;

    // Extraire les images du bloc
    const imgs = $el.find('img');
    const text = cleanText($el.text());

    if (imgs.length > 0) {
      // Bloc d'images
      const imageList = [];
      imgs.each((_, imgEl) => {
        const src = $(imgEl).attr('src');
        const alt = $(imgEl).attr('alt') || locationTitle;
        const parentLink = $(imgEl).parent('a').attr('href');

        // Ne pas inclure la bannière gif ou les boutons de liens
        if (src && !src.endsWith('.gif') && !src.includes('contact')) {
          imageList.push({ src, alt, link: parentLink || null });
        }
      });

      if (imageList.length > 0) {
        bodyElements.push({ type: 'gallery', images: imageList });
      }
    } else if (text.length > 3) {
      // Bloc de texte narratif
      const isCentered = $el.find('[align="center"]').length > 0 || $el.attr('align') === 'center';
      bodyElements.push({ type: 'text', content: text, centered: isCentered });
    }
  });

// 4. Extraire les liens du footer (liens vers les autres lieux et le contact)
  const relatedLinks = [];
  $('a').each((_, aEl) => {
    const $a = $(aEl);
    const href = $a.attr('href');
    const img = $a.find('img');
    
    if (img.length > 0 && href) {
      const imgSrc = img.attr('src');
      
      // Le chaînage optionnel (?.) vérifie si 'imgSrc' existe avant d'appeler .includes()
      // Cela évite toute erreur si l'image n'a pas d'attribut src
      if (imgSrc?.includes('lien')) {
        relatedLinks.push({ 
          href, 
          src: imgSrc, 
          alt: img.attr('alt') || "Visiter le lieu" 
        });
      }
    }
  });

  const contactHref = $('a[href*="contact"]').attr('href') || "../contact/contact.htm";
  const contactImgSrc = $('a[href*="contact"] img').attr('src') || "../contact/contact.gif";

  // 5. Reconstruire le HTML cible épuré
  let sectionsHtml = '';
  
  bodyElements.forEach(item => {
    if (item.type === 'text') {
      const centerClass = item.centered ? ' text-center' : '';
      sectionsHtml += `\n    <section class="text-block${centerClass}">\n      <p>${item.content}</p>\n    </section>\n`;
    } else if (item.type === 'gallery') {
      sectionsHtml += `\n    <section class="photo-gallery">\n`;
      item.images.forEach(img => {
        if (img.link) {
          sectionsHtml += `      <a href="${img.link}"><img src="${img.src}" alt="${img.alt}"></a>\n`;
        } else {
          sectionsHtml += `      <img src="${img.src}" alt="${img.alt}">\n`;
        }
      });
      sectionsHtml += `    </section>\n`;
    }
  });

  let relatedNavHtml = '';
  if (relatedLinks.length > 0) {
    relatedNavHtml = `\n      <nav class="related-links" aria-label="Visites associées">\n`;
    relatedLinks.forEach(link => {
      relatedNavHtml += `        <a href="${link.href}"><img src="${link.src}" alt="${link.alt}"></a>\n`;
    });
    relatedNavHtml += `      </nav>`;
  }

  const finalHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${pageTitle}</title>

  <meta name="keywords" content="${metaKeywords}">
  <meta name="description" content="${metaDescription}">
  <meta name="author" content="Tim / Timothy Hannem">
  <meta name="owner" content="Tim / Timothy Hannem">
  <meta name="copyright" content="Tim / Timothy Hannem">
  <meta name="robots" content="all">

  <meta property="og:title" content="${pageTitle}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${ogUrl}">
  <meta property="og:image" content="${ogImage}">

  <link rel="SHORTCUT ICON" href="http://www.glauqueland.com/favicon.ico">

  <link rel="stylesheet" href="../global.css">
  <link rel="stylesheet" href="../article.css">
</head>
<body>

  <main class="album-container">

    <header class="album-header">
      <h1 class="visually-hidden">${locationTitle}</h1>
      ${titleBannerImg ? `<img src="${titleBannerImg}" alt="${locationTitle}" class="title-banner-img">` : ''}
      ${warningText ? `<div class="warning-box">\n        <p>${warningText}</p>\n      </div>` : ''}
    </header>
${sectionsHtml}
    <footer class="album-footer">${relatedNavHtml}
      <div class="contact-link">
        <a href="${contactHref}">
          <img src="${contactImgSrc}" alt="Me contacter par mail">
        </a>
      </div>
    </footer>

  </main>

</body>
</html>`;

  // 6. Écrire le fichier dans le dossier de destination dist/
  const outputPath = path.join(OUTPUT_DIR, relativePath);
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, finalHtml, 'utf-8');
  console.log(`✅ Transformé : ${relativePath}`);
}

/**
 * Fonction principale de lancement
 */
async function run() {
  try {
    console.log("🚀 Début de la conversion des fichiers HTML...");
    
    // Rechercher tous les fichiers HTML dans les sous-dossiers
    const files = await glob('**/*.html', { cwd: INPUT_DIR, absolute: true });
    
    for (const file of files) {
      await processFile(file);
    }

    console.log("\n🎉 Conversion terminée avec succès ! Les fichiers nettoyés sont dans le dossier /dist.");
  } catch (error) {
    console.error("❌ Erreur pendant la conversion :", error);
  }
}

run();