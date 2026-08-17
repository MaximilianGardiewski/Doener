const PUBLIC_COPY = {
  heroIntro: "Ein Ort zum Ankommen, Essen und Zusammensein — und wenn es schnell gehen soll, bestellst du direkt hier zur Abholung oder für später vor.",
  heroMediaLabel: "Einblicke",
  heroMediaText: "Hier zeigen wir nur Fotos und Geschichten, die Mcello selbst freigegeben hat.",
  storyVenue: "Mcello soll sich online genauso unkompliziert anfühlen wie vor Ort: stöbern, auswählen, bestellen — oder einfach entdecken, was gerade los ist.",
  storySelection: "Was Mcello besonders macht, erzählen und zeigen wir hier mit bestätigten Inhalten statt mit erfundenen Werbeversprechen.",
  newsIntro: "Was bei Mcello ansteht, landet hier: Neues, Specials, Events und alles, wofür es sich lohnt vorbeizuschauen.",
  newsEmpty: "Gerade nichts Neues veröffentlicht — sobald bei Mcello etwas ansteht, findest du es hier.",
  galleryTitle: "Momente aus Mcello.",
  galleryIntro: "Food, Lokal, Team und Events — hier erscheinen ausschließlich freigegebene Originalfotos.",
  galleryEmpty: "Noch keine freigegebenen Fotos — hier bleibt es lieber ehrlich als künstlich gefüllt.",
  contactTitle: "Komm vorbei.",
  contactIntro: "Adresse, Telefon, WhatsApp und Öffnungszeiten erscheinen hier, sobald die final bestätigten Kontaktdaten hinterlegt sind.",
  contactCard: "Adresse und direkte Kontaktwege werden hier veröffentlicht, sobald sie final bestätigt sind.",
};

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function installPublicCopyTone() {
  setText(".hero-copy > p", PUBLIC_COPY.heroIntro);
  setText(".hero-media .float-card small", PUBLIC_COPY.heroMediaLabel);
  setText(".hero-media .float-card strong", PUBLIC_COPY.heroMediaText);
  setText("#ueber .story-card:first-child .story-copy p", PUBLIC_COPY.storyVenue);
  setText("#ueber .story-card:nth-child(2) .story-copy p", PUBLIC_COPY.storySelection);
  setText("#aktuelles .section-head > p", PUBLIC_COPY.newsIntro);
  setText("#newsStack .notice", PUBLIC_COPY.newsEmpty);
  setText("#galerie .section-head h2", PUBLIC_COPY.galleryTitle);
  setText("#galerie .section-head > p", PUBLIC_COPY.galleryIntro);
  setText("#galleryGrid .notice", PUBLIC_COPY.galleryEmpty);
  setText("#kontakt .section-head h2", PUBLIC_COPY.contactTitle);
  setText("#kontakt .section-head > p", PUBLIC_COPY.contactIntro);
  setText("#kontakt .story-card > p", PUBLIC_COPY.contactCard);
  setText(".footer .brand span", "Bad Krozingen");

  const meta = document.querySelector(".hero .meta-row");
  if (meta) {
    meta.innerHTML = [
      "<span><strong>Abholung</strong> direkt bestellen</span>",
      "<span><strong>Vorbestellung</strong> für später</span>",
      "<span><strong>Direkt</strong> im Browser & auf dem Homescreen</span>",
    ].join("");
  }
}

installPublicCopyTone();

export { PUBLIC_COPY, installPublicCopyTone };
