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
    user: "mohannedbentaleb8@gmail.com",
    pass: "lvfgecyfizyljmfy"
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

// Load all menus
function loadMenus() {
  const file = path.join(__dirname, "menus.json");
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Save menus
function saveMenus(data) {
  const file = path.join(__dirname, "menus.json");
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Send today’s menu to student interface
app.get("/api/menu/today", (req, res) => {
  const menus = loadMenus();
  const today = new Date().toISOString().slice(0, 10);
  console.log("Today's date:", today);

  const todayMenu = menus.find(m => m.date === today);


  if (!todayMenu) {
    return res.status(404).json({ message: "No menu available for today." });
  }

  res.json(todayMenu);
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
  const studentEmail = "btmohanned671@gmail.com";
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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const { HfInference } = require("@huggingface/inference");

const hf = new HfInference(); // you can leave token empty for free inference, but rate-limited

app.post("/admin/generate-menu", async (req, res) => {
  const prompt = req.body.text || "Generate a restaurant menu for today with 3 starters, 3 mains, 2 desserts";

  // First try OpenAI
  try {
    const openAIResp = await fetch("https://api.openai.com/v1/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "text-davinci-003", // or "gpt-3.5-turbo" if available
        prompt: prompt,
        max_tokens: 200,
        temperature: 0.7
      })
    });

    const openAIData = await openAIResp.json();

    if(openAIData.error && openAIData.error.code === "insufficient_quota") {
      throw new Error("OpenAI quota exceeded");
    }

    return res.json({ menuText: openAIData.choices[0].text.trim() });

  } catch (err) {
    console.log("OpenAI failed, falling back to Hugging Face:", err.message);

    try {
      const hfResp = await hf.textGeneration({
        model: "tiiuae/falcon-7b-instruct", // small, free HF model
        inputs: prompt,
        parameters: { max_new_tokens: 150 }
      });

      const hfText = hfResp.generated_text || hfResp[0].generated_text;
      return res.json({ menuText: hfText.trim() });

    } catch(hfErr) {
      console.error("Hugging Face fallback also failed:", hfErr);
      return res.status(500).json({ error: "Failed to generate menu with both AI providers" });
    }
  }
});


// Route to approve and save menu

app.post("/admin/approve-menu", (req, res) => {
  const { menu } = req.body;
  if (!menu || !menu.length) return res.status(400).json({ message: "Menu vide !" });

  const filePath = path.join(__dirname, "menu-approved.json");
  let approvedMenus = [];

  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, "utf8").trim();
    if (data) approvedMenus = JSON.parse(data);
  }

  approvedMenus.push({
    date: new Date().toISOString(),
    menu
  });

  fs.writeFileSync(filePath, JSON.stringify(approvedMenus, null, 2));
  res.json({ message: "Menu approuvé et enregistré !" });
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
    email: "btmohanned671@gmail.com",
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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
