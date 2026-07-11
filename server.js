require('dotenv').config(); 
const express = require('express');
const session = require('express-session');
const compression = require('compression');
const path = require('path');
const { MongoClient } = require('mongodb'); 

const app = express();

// 1. CONEXIÓN A LA BASE DE DATOS EN LA NUBE
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://Token:token@faccion-token.zk7e7jg.mongodb.net/?appName=Faccion-token";
const client = new MongoClient(MONGO_URI);
let db, usuariosCollection;

async function conectarBaseDeDatos() {
    try {
        await client.connect();
        db = client.db('sistema_facciones');
        usuariosCollection = db.collection('usuarios_y_tokens');
        console.log("🛡️ Mainframe conectado a la Base de Datos en la Nube (MongoDB)");

        // Insertar líderes por defecto si la base de datos está vacía
        const conteo = await usuariosCollection.countDocuments();
        if (conteo === 0) {
            const lideresPorDefecto = [
                { user: "lider_academia", pass: "academia", faction: "academia", role: "Lider" },
                { user: "lider_fuego", pass: "fuego123", faction: "Fuego", role: "Lider" },
                { user: "lider_agua", pass: "agua123", faction: "Agua", role: "Lider" },
                { user: "lider_tierra", pass: "tierra123", faction: "Tierra", role: "Lider" }
            ];
            await usuariosCollection.insertMany(lideresPorDefecto);
        }
    } catch (error) {
        console.error("❌ Error conectando a MongoDB:", error);
    }
}
conectarBaseDeDatos();

// 2. MIDDLEWARES ESTÁNDAR
app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'token_ancestral_facciones_2026',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Carpeta de archivos estáticos (Sirve CSS, JS e imágenes automáticamente)
app.use(express.static(path.join(__dirname, 'public')));

// =========================================================================
// PÁGINA PRINCIPAL
// =========================================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =========================================================================
// 3. RUTAS PARA CONTROLAR LOS ARCHIVOS HTML (URLs Limpias)
// =========================================================================

// Entrada principal (index.html se sirve automático, pero lo aseguramos)
app.get('/logout', (req, res) => {
    req.session.destroy(); // Limpia la sesión al salir
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para el login de los líderes (Tu pantalla de Alto Mando)
app.get('/altomando/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login_lideres.html'));
});

// Ruta para el login de la academia / miembros
app.get('/academia/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login_facciosos.html'));
});

// Panel de control (lider.html) protegido por sesión para Líderes
app.get('/acceso-facciosos', (req, res) => {
    if (!req.session.usuarioLogueado || req.session.role !== "Lider") {
        return res.redirect('/'); 
    }
    res.sendFile(path.join(__dirname, 'public', 'lider.html')); 
});

// Ruta pública para los tutoriales en video de reclutas
app.get('/tutoriales', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tutoriales.html'));
});



// --- VISTAS PROTEGIDAS POR TOKEN DE FACCIÓN ---

app.get('/contenido-academia', (req, res) => {
    if (!req.session.usuarioLogueado || req.session.faction.toLowerCase() !== 'academia') {
        return res.redirect('/'); 
    }
    res.sendFile(path.join(__dirname,'contenido_academia.html'));
});

app.get('/contenido-fuego', (req, res) => {
    if (!req.session.usuarioLogueado || req.session.faction.toLowerCase() !== 'fuego') {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname,'contenido_fuego.html'));
});

app.get('/contenido-agua', (req, res) => {
    if (!req.session.usuarioLogueado || req.session.faction.toLowerCase() !== 'agua') {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname,'contenido_agua.html'));
});

app.get('/contenido-tierra', (req, res) => {
    if (!req.session.usuarioLogueado || req.session.faction.toLowerCase() !== 'tierra') {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname,'contenido_tierra.html'));
});


// =========================================================================
// 4. ENDPOINTS DE LA API (PROCESAMIENTO DE DATOS)
// =========================================================================

// ⚡ ENDPOINT: LOGIN DE LÍDERES
app.post('/api/login-lideres', async (req, res) => {
    try {
        const { user, pass } = req.body;

        const liderValido = await usuariosCollection.findOne({ 
            user: user.trim(), 
            pass: pass.trim(),
            role: "Lider" 
        });

        if (!liderValido) {
            return res.status(401).json({ success: false, message: "🚨 Credenciales de mando inválidas." });
        }

        // Activamos la sesión del Líder
        req.session.usuarioLogueado = true;
        req.session.faction = liderValido.faction;
        req.session.role = "Lider";

        res.json({ success: true, redirect: '/acceso-facciosos' }); 
    } catch (err) {
        res.status(500).json({ success: false, message: "Falla en el mainframe de autenticación." });
    }
});

// ⚡ ENDPOINT: GENERAR TOKEN
app.post('/api/generar-token', async (req, res) => {
    if (!req.session.usuarioLogueado || req.session.role !== "Lider") {
        return res.status(403).json({ error: "Denegado" });
    }

    const faccionLider = req.session.faction;
    const caracteres = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let bloque1 = "", bloque2 = "";
    for (let i = 0; i < 4; i++) {
        bloque1 += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
        bloque2 += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    const tokenGenerado = `${faccionLider.toUpperCase()}-${bloque1}-${bloque2}`;

    try {
        const limite24Horas = 24 * 60 * 60 * 1000;
        const tiempoCorte = Date.now() - limite24Horas;
        await usuariosCollection.deleteMany({ role: "TokenCompartido", creadoEn: { $lt: tiempoCorte } });

        await usuariosCollection.insertOne({
            token: tokenGenerado,
            faction: faccionLider,
            role: "TokenCompartido",
            creadoEn: Date.now()
        });

        res.json({ token: tokenGenerado, faction: faccionLider });
    } catch (err) {
        res.status(500).json({ error: "Error al guardar el token en la nube." });
    }
});

// ⚡ ENDPOINT: LOGIN POR TOKEN (Para los miembros/facciosos)
app.post('/api/login-token', async (req, res) => {
    try {
        const { token, factionUrl } = req.body;

        const tokenValido = await usuariosCollection.findOne({ 
            token: token.trim().toUpperCase(), 
            role: "TokenCompartido" 
        });

        if (!tokenValido) {
            return res.status(401).json({ success: false, message: "El Token de acceso no existe." });
        }

        const limite24Horas = 24 * 60 * 60 * 1000;
        if ((Date.now() - Number(tokenValido.creadoEn)) > limite24Horas) {
            return res.status(401).json({ success: false, message: "⚠️ Este token ha expirado." });
        }

        if (tokenValido.faction.toLowerCase() !== factionUrl.toLowerCase()) {
            return res.status(403).json({ success: false, message: `⚠️ Código inválido para la División ${factionUrl.toUpperCase()}.` });
        }

        req.session.usuarioLogueado = true;
        req.session.faction = tokenValido.faction;
        req.session.role = "Miembro";

        // Redirección dinámica según la facción correspondiente
        res.json({ success: true, redirect: `/contenido-${tokenValido.faction.toLowerCase()}` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Falla en el mainframe de la base de datos." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Servidor asegurado en puerto ${PORT}`); });
