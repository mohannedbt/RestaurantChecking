const express = require("express");
const path = require("path");
const QRCode = require("qrcode");
const nodemailer = require("nodemailer");

require('dotenv').config();

// ⚠ Make sure you use an app password for Gmail, not your main password
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
port: 465,
secure: true,
 // true for 465
  auth: {
     user: "habbachiafef18@gmail.com",
    pass: "mtcv caqm ecpo uqoa"
  }
});
async function generatePaymentQRCode(payment) {
  // Encode essential payment info
  const data = JSON.stringify({
    id: payment.id,
    carteEtudiant: payment.carteEtudiant,
    montant: payment.montant,
    date: payment.date
  });

  const qrDataUrl = await QRCode.toDataURL(data); // returns base64 PNG
  return qrDataUrl;
}



const app = express();
const PORT = 3000;
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const bodyParser = require("body-parser");
app.use(bodyParser.json());

// --- Helpers pour JSON ---
function loadJSON(filename) {
  const filePath = path.join(__dirname, filename);
  if (!fs.existsSync(filePath)) return [];
  const data = fs.readFileSync(filePath, "utf8").trim();
  return data ? JSON.parse(data) : [];
}

function saveJSON(filename, data) {
  const filePath = path.join(__dirname, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// --- Routes ---
// 1️⃣ Voir les associations partenaires
app.get("/associations/partners", (req, res) => {
  const associations = loadJSON("partners.json");
  res.json(associations);
});

// 2️⃣ Proposer un événement
app.post("/associations/propose-event", (req, res) => {
  const { nomAssociation, titreEvent, description, date } = req.body;
  if (!nomAssociation || !titreEvent || !date) {
    return res.status(400).json({ message: "Données manquantes" });
  }

  const events = loadJSON("events.json");
  const newEvent = {
    id: Date.now().toString(),
    nomAssociation,
    titreEvent,
    description: description || "",
    date,
    participants: []
  };

  events.push(newEvent);
  saveJSON("events.json", events);

  res.json({ message: "Événement proposé avec succès !", event: newEvent });
});

// 3️⃣ Suivi de l'engagement étudiant
app.get("/associations/engagement", (req, res) => {
  const events = loadJSON("events.json");
  res.json(events.map(ev => ({
    id: ev.id,
    titreEvent: ev.titreEvent,
    date: ev.date,
    participants: ev.participants.length
  })));
});

// Load all menus
function loadMenus() {
  const file = path.join(__dirname, "menu.json");
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Save menus
function saveMenus(data) {
  const file = path.join(__dirname, "menu.json");
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
const REPAS_FILE = path.join(__dirname, "repas_excedentaires.json");

function loadRepasExcedentaires() {
  if (!fs.existsSync(REPAS_FILE)) return [];
  return JSON.parse(fs.readFileSync(REPAS_FILE, "utf8"));
}

function saveRepasExcedentaires(data) {
  fs.writeFileSync(REPAS_FILE, JSON.stringify(data, null, 2));
}
app.get("/api/menu/today", (req, res) => {
  const menus = loadMenus();
  console.log("Loaded menus:", menus);
  const today = new Date().toISOString().slice(0, 10);
  console.log("Today's date:", today);
  const todayMenu = menus.find(m => m.date === today);
  console.log("Today's menu:", todayMenu);
  if (!todayMenu) {
    return res.status(404).json({ message: "No menu available for today." });
  }

  // Send no-cache headers
  res.setHeader("Cache-Control", "no-store");

  // Return menu as an array of names
  res.json({
    date: todayMenu.date,
    menu: todayMenu.menu
  });
});


// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/paiment", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "paiment.html"));
});
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get("/menu", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "menu.html")); 
});
app.get("/admin/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin", "admin.html"));
});
app.get("/admin/paiment", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin", "adminpaiment.html"));
}); 
app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin", "admin_login.html"));   
});
app.get("/logout", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin", "admin_login.html"));
});
app.get("/admin/proposition", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin", "admin_proposition.html"));
});
app.get("/proposition", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "proposition.html"));  
});

// Route to get non-paying students
app.get("/admin/payments", (req, res) => {
  const operations = loadOps();
  const nonPaid = operations.filter(op => !op.paid);
  res.json(nonPaid);
});

// Route to confirm payment
app.post("/admin/confirm-payment", async (req, res) => {
  const { id } = req.body; // no need to send email from frontend
  const operations = loadOps();
  const op = operations.find(o => o.id === id);
  if (!op) return res.status(404).json({ message: "Operation not found" });

  op.paid = true;
  saveOps(operations);

  // Send email to the fixed address
  const studentEmail = "afefhabachi00@gmail.com";;
  await sendPaymentEmail(studentEmail, op);

  res.json({ message: `Payment for ${op.carteEtudiant} confirmed & email sent`, operation: op });
});


// Load propositions from JSON
function loadPropositions() {
  const filePath = path.join(__dirname, "propositions.json");
  if (!fs.existsSync(filePath)) return [];
  const data = fs.readFileSync(filePath, "utf8").trim();
  if (!data) return [];
  return JSON.parse(data);
}
app.post("/admin/propositions/:id/approve", (req, res) => {
  const { id } = req.params;
  const propositions = loadPropositions();
  const prop = propositions.find(p => p.id === id);
  if (!prop) return res.status(404).json({ message: "Proposition not found" });
  prop.approved = true;
  savePropositions(propositions);
  res.json({ message: "Proposition approved!", proposition: prop });
});

// Save propositions to JSON
function savePropositions(data) {
  const filePath = path.join(__dirname, "propositions.json");
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log("Propositions saved successfully!");
  } catch (err) {
    console.error("Error saving propositions.json:", err);
  }
}
app.get("/admin/menu", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin", "admin_menu.html"));
});
// server.js (Node/Express)

app.use(bodyParser.json());

app.post("/admin/repas-excedentaires", (req, res) => {
  const { nomPlat, quantite } = req.body; 
  if (!nomPlat || quantite == null) return res.status(400).json({ message: "Données manquantes" });

  const menus = loadMenus();
  const today = new Date().toISOString().slice(0, 10);
  const todayMenu = menus.find(m => m.date === today);
  if (!todayMenu) return res.status(404).json({ message: "Pas de menu pour aujourd'hui." });

  const repasExcedentaires = loadRepasExcedentaires();
  let repasDuJour = repasExcedentaires.find(r => r.date === today);

  if (!repasDuJour) {
    repasDuJour = { date: today, items: [] };
    repasExcedentaires.push(repasDuJour);
  }

  // Vérifier si le plat existe déjà
  let plat = repasDuJour.items.find(p => p.nom === nomPlat);
  if (plat) {
    plat.quantite += quantite;
  } else {
    plat = { nom: nomPlat, quantite };
    repasDuJour.items.push(plat);
  }

  saveRepasExcedentaires(repasExcedentaires);

  res.json({ message: `Repas excédentaire ajouté pour ${nomPlat}`, plat });
});


// ----------- ROUTES ASSOCIATION -----------

// Lister tous les repas excédentaires disponibles
app.get("/association/repas-excedentaires", (req, res) => {
  const repasExcedentaires = loadRepasExcedentaires();
  res.json(repasExcedentaires);
});

// Collecter des repas excédentaires (réduire la quantité)
app.post("/association/collecter", (req, res) => {
  const { date, nomPlat, quantite } = req.body;
  if (!date || !nomPlat || quantite == null) return res.status(400).json({ message: "Données manquantes" });

  const repasExcedentaires = loadRepasExcedentaires();
  const jour = repasExcedentaires.find(r => r.date === date);
  if (!jour) return res.status(404).json({ message: "Pas de repas excédentaires pour ce jour" });

  const plat = jour.items.find(i => i.nom === nomPlat);
  if (!plat) return res.status(404).json({ message: "Plat introuvable" });

  if (plat.quantite < quantite) return res.status(400).json({ message: "Quantité insuffisante" });

  plat.quantite -= quantite;

  saveRepasExcedentaires(repasExcedentaires);

  res.json({ message: "Repas collecté avec succès", plat });
});

const LOCAL_AI_URL = "https://ai-api-1-quga.onrender.com/chat";

// Default Tunisian menu categories in French

app.post("/admin/generate-menu", async (req, res) => {
  try {
    // Build the prompt for the AI
    const prompt = `
Génère un menu pour aujourd'hui à partir de cette liste :
- Entrées : salade mechwiya, salade normale
- Plats principaux : macaronis, couscous, riz + fromage, oeuf, poulet, viande de mouton
- Desserts : yaourt, fruits de saison, cake

Règles :
1. Choisis exactement une entrée, un plat principal et un dessert selon une combinaison réaliste.
2. Mets uniquement le nom des plats en gras avec <b></b>.
3. Ne mets aucun lien HTML ni prix.
4. Ne mets aucune description.
Exemple attendu(le suit  sans modification):
  "entree": "<b>Salade Mechwiya</b>",
  "plat": "<b>Couscous au poulet</b>",
  "dessert": "<b>Yaourt</b>"

`;

    // Call your local AI
    const response = await fetch(LOCAL_AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({  message: prompt })
    });

    const data = await response.json();
    let menuText = data.reply || "";

    // Replace any ****text**** with <b>text</b> just in case
    menuText = menuText.replace(/\*{4}(.*?)\*{4}/g, "<b>$1</b>");

    // Try to parse AI output as JSON
    let menuJSON;
    try {
      menuJSON = JSON.parse(menuText);
    } catch {
      // Fallback: wrap the text as a single field
      menuJSON = { menu: menuText };
    }

    res.json({ menu: menuJSON });

  }catch (err) {
    console.error("Erreur lors de la génération du menu :", err);
    res.status(500).json({ error: "Échec de la génération du menu via l'AI locale" });
  }
});

// Route to approve and save menu

app.post("/admin/approve-menu", (req, res) => {
  const { menu } = req.body;
  console.log(menu) // menu is an array of dish names: ["Salade Mechwiya", "Couscous au poulet", "Yaourt"]
  if (!menu || !menu.length) return res.status(400).json({ message: "Menu vide !" });

  const filePath = path.join(__dirname, "menu.json");
  let allMenus = [];

  // Load existing menus
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, "utf8").trim();
    if (data) allMenus = JSON.parse(data);
  }

  const today = new Date().toISOString().slice(0, 10);

  // Check if today's menu exists
  const todayIndex = allMenus.findIndex(m => m.date === today);
  if (todayIndex >= 0) {
    // Overwrite today's menu
    allMenus[todayIndex].menu = menu;
  } else {
    // Add new menu
    allMenus.push({
      date: today,
      menu
    });
  }

  // Save menus
  fs.writeFileSync(filePath, JSON.stringify(allMenus, null, 2));

  res.json({ message: "Menu approuvé et enregistré !", menu });
});
// Route to submit a proposition
app.post("/submit-proposition", (req, res) => {
  const { nom, carteEtudiant, proposition, date } = req.body;

  if (!nom || !carteEtudiant || !proposition) {
    return res.status(400).json({ message: "Données manquantes" });
  }

  const propositions = loadPropositions();

  const newProposal = {
    id: Date.now().toString(), // unique id
    nom,
    carteEtudiant,
    proposition,
    date,
    approved: false
  };

  propositions.push(newProposal);
  savePropositions(propositions);

  res.json({ message: "Proposition enregistrée avec succès !" });
});

// Example route to view all propositions (for admin)
app.get("/admin/propositions", (req, res) => {
  const propositions = loadPropositions();
  const pending=propositions.filter(p => !p.approved);
  res.json(pending);
});

// Charger les opérations
function loadOps() {
  if (!fs.existsSync("operations.json")) return []; // File doesn't exist
  const data = fs.readFileSync("operations.json", "utf8").trim();
  if (!data) return []; // Empty file → return empty array
  return JSON.parse(data); // Parse normally if content exists
}


// Sauvegarder
function saveOps(data) {
  try {
    fs.writeFileSync(path.join(__dirname, "operations.json"), JSON.stringify(data, null, 2));
    console.log("Operations saved successfully!");
  } catch (err) {
    console.error("Failed to save operations.json:", err);
  }
}


async function sendPaymentEmail(studentEmail, payment) {
  // Generate QR code as buffer
  const qrBuffer = await QRCode.toBuffer(JSON.stringify({
    id: payment.id,
    carteEtudiant: payment.carteEtudiant,
    montant: payment.montant,
    date: payment.date
  }));

  const mailOptions = {
    from: '"Restorant" <youremail@gmail.com>',
    to: studentEmail,
    subject: "Payment Confirmation & QR Code",
    html: `
      <h2>Payment Confirmation</h2>
      <p>Hello, your payment has been confirmed!</p>
      <p><strong>Carte:</strong> ${payment.carteEtudiant}</p>
      <p><strong>Amount:</strong> $${payment.montant}</p>
      <p><strong>Date:</strong> ${new Date(payment.date).toLocaleString()}</p>
      <p>Scan this QR code to view your payment info:</p>
      <img src="cid:qrcodeimg" alt="Payment QR Code" />
    `,
    attachments: [{
      filename: "qrcode.png",
      content: qrBuffer,
      cid: "qrcodeimg" // same as in img src
    }]
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.messageId);
  } catch (err) {
    console.error("Error sending email:", err);
  }
}


// 🎯 Génération QR + enregistrement
app.post("/generate-qr", (req, res) => {
    console.log("Received request to /generate-qr");
    console.log("Request body:", req.body);
  const carteEtudiant= req.body.carte;
  const datelogin= req.body.dateLogin;
  console.log("carteEtudiant:", carteEtudiant);
  

  if  (!carteEtudiant) {
    console.log("error");
    return res.status(400).json({ message: "Données manquantes" });
    
  }

  const operations = loadOps();

  const token = uuidv4(); // ID unique
  const qrUrl = `https://mon-serveur.com/verify/${token}`; // Lien encodé dans le QR

  const newOperation = {
    id: token,
    carteEtudiant,
    email: "afefhabachi00@gmail.com",
    montant: 0.2,
    date: datelogin,
    paid: false,
    used: false,
    qr: qrUrl
  };

  operations.push(newOperation);
  saveOps(operations);

  res.json({
    message: "QR généré et opération enregistrée",
    operation: newOperation
  });
});
const stagesFile = path.join(__dirname, "stages.json");

// Charger les stages
function loadStages() {
  if (!fs.existsSync(stagesFile)) return [];
  const data = fs.readFileSync(stagesFile, "utf8").trim();
  if (!data) return [];
  return JSON.parse(data);
}

// Sauvegarder les stages
function saveStages(data) {
  fs.writeFileSync(stagesFile, JSON.stringify(data, null, 2));
}

// Récupérer toutes les offres de stage (GET)
app.get("/association/stages", (req, res) => {
  const stages = loadStages();
  res.json(stages);
});

// Ajouter une nouvelle offre de stage (POST)
app.post("/association/stages", (req, res) => {
  const { titre, description } = req.body;
  if (!titre || !description) return res.status(400).json({ message: "Données manquantes" });

  const stages = loadStages();
  const newStage = {
    id: Date.now().toString(),
    titre,
    description
  };
  stages.push(newStage);
  saveStages(stages);

  res.json({ message: "Stage ajouté avec succès", stage: newStage });
});

const recyclageFile = path.join(__dirname, "recyclage.json");

// Charger les actions écologiques
function loadRecyclage() {
  if (!fs.existsSync(recyclageFile)) return [];
  const data = fs.readFileSync(recyclageFile, "utf8").trim();
  if (!data) return [];
  return JSON.parse(data);
}

// Sauvegarder les actions
function saveRecyclage(data) {
  fs.writeFileSync(recyclageFile, JSON.stringify(data, null, 2));
}

// Récupérer toutes les actions (GET)
app.get("/association/recyclage", (req, res) => {
  const actions = loadRecyclage();
  res.json(actions);
});

// Ajouter une nouvelle action (POST)
app.post("/association/recyclage", (req, res) => {
  const { titre, description } = req.body;
  if (!titre || !description) return res.status(400).json({ message: "Données manquantes" });

  const actions = loadRecyclage();
  const newAction = {
    id: Date.now().toString(),
    titre,
    description
  };
  actions.push(newAction);
  saveRecyclage(actions);

  res.json({ message: "Action ajoutée avec succès", action: newAction });
});
const repasExcedentairesFile = path.join(__dirname, "repasExcedentaires.json");

function loadRepasExcedentaires() {
  if (!fs.existsSync(repasExcedentairesFile)) return [];
  const data = fs.readFileSync(repasExcedentairesFile, "utf8").trim();
  if (!data) return [];
  return JSON.parse(data);
}

function saveRepasExcedentaires(data) {
  fs.writeFileSync(repasExcedentairesFile, JSON.stringify(data, null, 2));
}

// Ajouter un repas excédentaire (Admin)
app.post("/admin/repas-excedentaires", (req, res) => {
  const { nomPlat, quantite } = req.body;
  if (!nomPlat || !quantite) return res.status(400).json({ message: "Données manquantes" });

  const repasExcedentaires = loadRepasExcedentaires();
  const today = new Date().toISOString().slice(0, 10);
  let jour = repasExcedentaires.find(r => r.date === today);

  if (!jour) {
    jour = { date: today, items: [] };
    repasExcedentaires.push(jour);
  }

  const plat = jour.items.find(p => p.nom === nomPlat);
  if (plat) {
    plat.quantite += quantite;
  } else {
    jour.items.push({ nom: nomPlat, quantite });
  }

  saveRepasExcedentaires(repasExcedentaires);

  res.json({ message: `Repas excédentaire ajouté pour ${nomPlat}`, plat: { nom: nomPlat, quantite } });
});
const ateliersFile = path.join(__dirname, "ateliers.json");

function loadAteliers() {
  if (!fs.existsSync(ateliersFile)) return [];
  const data = fs.readFileSync(ateliersFile, "utf8").trim();
  if (!data) return [];
  return JSON.parse(data);
}

function saveAteliers(data) {
  fs.writeFileSync(ateliersFile, JSON.stringify(data, null, 2));
}

// GET : récupérer tous les ateliers
app.get("/association/ateliers", (req, res) => {
  const ateliers = loadAteliers();
  res.json(ateliers);
});

// POST : créer un atelier
app.post("/association/ateliers", (req, res) => {
  const { titre, description, date } = req.body;
  if (!titre || !description || !date) return res.status(400).json({ message: "Données manquantes" });

  const ateliers = loadAteliers();
  const newAtelier = {
    id: Date.now().toString(),
    titre,
    description,
    date
  };
  ateliers.push(newAtelier);
  saveAteliers(ateliers);
  res.json({ message: "Atelier créé avec succès !" });
});

// DELETE : supprimer un atelier
app.delete("/association/ateliers/:id", (req, res) => {
  const { id } = req.params;
  let ateliers = loadAteliers();
  ateliers = ateliers.filter(a => a.id !== id);
  saveAteliers(ateliers);
  res.json({ message: "Atelier supprimé avec succès !" });
});
const PARTNERS_FILE = path.join(__dirname, "partners.json");
const EVENTS_FILE = path.join(__dirname, "events.json");

// Charger les partenaires
function loadPartners() {
  if (!fs.existsSync(PARTNERS_FILE)) return [];
  const data = fs.readFileSync(PARTNERS_FILE, "utf8").trim();
  return data ? JSON.parse(data) : [];
}

// Charger les événements
function loadEvents() {
  if (!fs.existsSync(EVENTS_FILE)) return [];
  const data = fs.readFileSync(EVENTS_FILE, "utf8").trim();
  return data ? JSON.parse(data) : [];
}

// Sauvegarder les événements
function saveEvents(events) {
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
}

// ----------- Routes -----------

// Retourne la liste des associations partenaires
app.get("/associations/partners", (req, res) => {
  const partners = loadPartners();
  res.json(partners);
});

// Retourne le suivi de l'engagement étudiant
app.get("/associations/engagement", (req, res) => {
  const events = loadEvents();
  res.json(events);
});

// Proposer un événement
app.post("/associations/propose-event", (req, res) => {
  const { nomAssociation, titreEvent, description, date } = req.body;
  if (!nomAssociation || !titreEvent || !date) {
    return res.status(400).json({ message: "Données manquantes" });
  }

  const events = loadEvents();
  const newEvent = {
    id: Date.now().toString(),
    nomAssociation,
    titreEvent,
    description,
    date,
    participants: 0 // par défaut
  };

  events.push(newEvent);
  saveEvents(events);

  res.json({ message: "Événement proposé avec succès !" });
});


app.get("/admin/repas-excedentaires", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "admin-repas-excedentaires.html"));}
);
app.get("/associations/retraits", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "association", "retrait_repas.html"));}
); 
app.get("/associations", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "association", "index.html"));}
);
app.get("/associations/stages", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "association", "stages.html"));}
);
app.get("/associations/recyclage", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "association", "recyclage.html"));}
);
app.get("/associations/collaborations", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "association", "collaborations.html"));}
);
app.get("/associations/ateliers", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "association", "ateliers.html"));}
);
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
