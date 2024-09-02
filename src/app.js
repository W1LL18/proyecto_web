const express = require('express');
const router = express.Router();
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cookieParser = require('cookie-parser');
const mysql = require('mysql2/promise'); // Usa mysql2/promise directamente
const app = express();
const crypto = require('crypto'); // Para generar tokens únicos
const nodemailer = require('nodemailer'); // Para enviar correos electrónicos
require('dotenv').config();  // Cargar variables de entorno desde .env

// Configuración del puerto
const PORT = process.env.PORT || 3000;

// Configuración del pool de conexiones
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '@180899W',
    database: 'proyecto_web',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Verificar la conexión al iniciar la app
pool.getConnection()
    .then(connection => {
        connection.release(); // Liberar la conexión
    })
    .catch(error => {
        console.error('Error al conectar a la base de datos:', error);
    });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cookieParser());

// Configurar el almacenamiento de sesiones en MySQL
const sessionStore = new MySQLStore({
    expiration: 10800000,
    createDatabaseTable: true, // Crear la tabla de sesiones si no existe
    schema: {
        tableName: 'sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
}, pool); // Usa el pool de conexiones directamente

// Configurar middleware de sesión
app.use(session({
    key: 'user_sid',
    secret: 's3cr3t_k3y',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        expires: 600000
    }
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));

// Middleware para chequear si el usuario está logueado
const sessionChecker = (req, res, next) => {
    if (req.session.user && req.cookies.user_sid) {
        res.redirect('/dashboard'); // Redirigir al tablero si está logueado
    } else {
        next();
    }
};

// Ruta para la página de inicio
app.get('/', sessionChecker, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Ruta para mostrar la página de registro
app.get('/registro', sessionChecker, (req, res) => {
    res.render('registro', { error: null, success: null });
});

// Ruta para manejar el registro de usuarios
app.post('/registro', async (req, res) => {
    const { nombre, email, telefono, password, confirm_password } = req.body;

    // Validaciones en el backend
    if (!nombre || !email || !telefono || !password || !confirm_password) {
        return res.render('registro', { error: 'Todos los campos son obligatorios', success: null });
    }

    if (password !== confirm_password) {
        return res.render('registro', { error: 'Las contraseñas no coinciden', success: null });
    }

    if (password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
        return res.render('registro', { error: 'La contraseña debe tener al menos 8 caracteres, una letra mayúscula y un número.', success: null });
    }

    try {
        // Verificar si el correo ya existe en la base de datos
        const [existingUser] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

        if (existingUser.length > 0) {
            return res.render('registro', { error: 'El correo electrónico ya está registrado', success: null });
        }

        // Hashear la contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insertar el nuevo usuario en la base de datos
        await pool.query('INSERT INTO users (nombre, email, telefono, password) VALUES (?, ?, ?, ?)', [nombre, email, telefono, hashedPassword]);

        // Redirigir con mensaje de éxito
        res.render('registro', { error: null, success: 'Usuario registrado exitosamente. ¡Ahora puedes iniciar sesión!' });
    } catch (err) {
        console.error(err);
        res.render('registro', { error: 'Ocurrió un error durante el registro. Por favor, intenta nuevamente.', success: null });
    }
});

// Ruta para la página de inicio de sesión
app.get('/login', sessionChecker, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Manejar el inicio de sesión
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Buscar al usuario en la base de datos
        const [results] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

        if (results.length > 0 && bcrypt.compareSync(password, results[0].password)) {
            req.session.user_id = results[0].id;
            req.session.user = results[0];
            res.redirect('/dashboard');
        } else {
            res.status(400).send('Correo o contraseña incorrectos');
        }
    } catch (err) {
        console.error('Error al buscar el usuario:', err.message);
        res.status(500).send('Error al iniciar sesión');
    }
});

// Ruta para el tablero (área protegida)
app.get('/dashboard', async (req, res) => {
    if (req.session.user && req.cookies.user_sid) {
        try {
            const [services] = await pool.query('SELECT * FROM services');
            const [technicians] = await pool.query('SELECT * FROM technicians');
            res.render('dashboard', { services, technicians });
        } catch (err) {
            console.error('Error al obtener datos:', err.message);
            res.status(500).send('Error al cargar los datos');
        }
    } else {
        res.redirect('/login');
    }
});

// Ruta para solicitar un servicio
app.post('/solicitar-servicio', async (req, res) => {
    const { service, technician, address } = req.body;
    const userId = req.session.user.id;

    try {
        await pool.query('INSERT INTO service_requests (user_id, service_id, technician_id, address) VALUES (?, ?, ?, ?)', [userId, service, technician, address]);
        res.send('Servicio solicitado con éxito');
    } catch (err) {
        console.error('Error al solicitar el servicio:', err.message);
        res.status(500).send('Error al solicitar el servicio');
    }
});

// Ruta para obtener la lista de técnicos
app.get('/technicians', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM technicians');
        res.render('technicians', { technicians: rows });
    } catch (error) {
        console.error('Error al obtener técnicos:', error);
        res.status(500).send('Error al obtener la lista de técnicos');
    }
});

// Manejar el cierre de sesión
app.get('/logout', (req, res) => {
    if (req.session.user && req.cookies.user_sid) {
        res.clearCookie('user_sid');
        res.redirect('/');
    } else {
        res.redirect('/login');
    }
});

// Ruta para obtener las solicitudes del usuario
app.get('/requests', async (req, res) => {
    if (req.session.user && req.cookies.user_sid) {
        const userId = req.session.user_id;

        try {
            const [requests] = await pool.query(`
                SELECT service_requests.*, services.name AS service_name, technicians.name AS technician_name 
                FROM service_requests
                JOIN services ON service_requests.service_id = services.id
                JOIN technicians ON service_requests.technician_id = technicians.id
                WHERE service_requests.user_id = ? 
                ORDER BY service_requests.created_at DESC
            `, [userId]);
            res.render('requests', { requests });
        } catch (err) {
            console.error('Error al obtener las solicitudes:', err.message);
            res.status(500).send('Error al cargar las solicitudes');
        }
    } else {
        res.redirect('/login');
    }
});

// Ruta para mostrar el formulario de solicitud de servicio
app.get('/service-request', (req, res) => {
    const service = req.query.service; // Captura el servicio seleccionado desde la URL
    res.render('service-request', { service }); // Renderiza la vista con el servicio seleccionado
});

// Ruta para procesar la solicitud de servicio
app.post('/submit-service-request', async (req, res) => {
    const { name, phone, address, email, service } = req.body;

    try {
        // Insertar la información del cliente en la tabla 'clients'
        const [clientResult] = await pool.query(
            'INSERT INTO clients (name, phone, address, email) VALUES (?, ?, ?, ?)',
            [name, phone, address, email]
        );

        // Obtener el ID del cliente recién insertado
        const clientId = clientResult.insertId;

        // Insertar la solicitud del servicio en la tabla 'service_requests'
        await pool.query(
            'INSERT INTO service_request_clientnoregister (client_id, service, status) VALUES (?, ?, ?)',
            [clientId, service, 'Pendiente']
        );
         
        // Agregar msg de confirmación
        // Redirigir al dashboard o a una página de confirmación
        res.send('Solicitud registrada con éxito');
        //res.redirect('/dashboard'); 
    } catch (error) {
        console.error('Error al procesar la solicitud de servicio:', error);
        res.status(500).send('Error al procesar la solicitud de servicio');
    }
});


// Ruta para mostrar la página de solicitud de restablecimiento de contraseña
app.get('/reset-password', (req, res) => {
    res.render('reset-password', { error: null, success: null });
});

// Ruta para manejar la solicitud de restablecimiento de contraseña
app.post('/reset-password', async (req, res) => {
    const { email } = req.body;

    try {
        // Verificar si el correo existe en la base de datos
        const [user] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        
        if (!user || user.length === 0) {  // Verificación correcta de la existencia del usuario
            return res.render('reset-password', { error: 'El correo electrónico no está registrado.', success: null });
        }

        // Generar un token único y su expiración
        const token = crypto.randomBytes(20).toString('hex');
        const expiration = new Date(Date.now() + 3600000); // 1 hora de expiración
        const formattedDate = expiration.toISOString().slice(0, 19).replace('T', ' '); // Formato: 'YYYY-MM-DD HH:MM:SS'

        // Guardar el token y su expiración en la base de datos
        await pool.query('UPDATE users SET resetPasswordToken = ?, resetPasswordExpires = ? WHERE email = ?', [token, formattedDate, email]);

        // Configurar el transporte de correo
        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        // Opciones de correo
        const mailOptions = {
            to: email,
            from: process.env.EMAIL_USER,
            subject: 'Restablecimiento de Contraseña',
            text: `Recibiste este correo porque (o alguien más) solicitó un restablecimiento de contraseña. 
            Por favor, haz clic en el siguiente enlace, o pégalo en tu navegador para completar el proceso:
            http://${req.headers.host}/reset-password/${token}\n\n
            Si no solicitaste esto, por favor ignora este correo y tu contraseña permanecerá sin cambios.`
        };

        // Enviar el correo
        await transporter.sendMail(mailOptions);
        res.render('reset-password', { error: null, success: 'Correo enviado con el enlace de restablecimiento de contraseña.' });

    } catch (err) {
        console.error(err);
        res.render('reset-password', { error: 'Error al procesar la solicitud. Inténtalo de nuevo.', success: null });
    }
});

// Ruta para manejar la página de restablecimiento de contraseña
app.get('/reset-password/:token', async (req, res) => {
    const { token } = req.params;

    try {
        // Verificar si el token es válido y no ha expirado
        const [user] = await pool.query('SELECT * FROM users WHERE resetPasswordToken = ? AND resetPasswordExpires > ?', [token, Date.now()]);
        
        if (user.length === 0) {
            return res.render('reset-password', { error: 'El enlace de restablecimiento es inválido o ha expirado.', success: null });
        }

        // Mostrar el formulario para ingresar la nueva contraseña
        res.render('new-password', { token: token, error: null, success: null });


    } catch (err) {
        console.error(err);
        res.redirect('/reset-password');
    }
});

// Ruta para actualizar la contraseña en la base de datos
app.post('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    const { password, confirm_password } = req.body;

    if (password !== confirm_password) {
        return res.render('new-password', { token: token, error: 'Las contraseñas no coinciden.', success: null });
    }

    try {
        // Verificar si el token es válido y no ha expirado
        const [user] = await pool.query('SELECT * FROM users WHERE resetPasswordToken = ? AND resetPasswordExpires > ?', [token, Date.now()]);
        
        if (user.length === 0) {
            return res.render('reset-password', { error: 'El enlace de restablecimiento es inválido o ha expirado.', success: null });
        }

        // Actualizar la contraseña del usuario en la base de datos
        const hashedPassword = bcrypt.hashSync(password, 10); // Asegúrate de tener bcrypt configurado
        await pool.query('UPDATE users SET password = ?, resetPasswordToken = NULL, resetPasswordExpires = NULL WHERE id = ?', [hashedPassword, user[0].id]);

        res.render('new-password', { token: token, error: null, success: 'Tu contraseña ha sido actualizada con éxito.' }); // Agregar variables 'error' y 'success'

    } catch (err) {
        console.error(err);
        res.render('reset-password', { error: 'Error al restablecer la contraseña. Inténtalo de nuevo.', success: null });
    }
});





// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});
