const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cookieParser = require('cookie-parser');
const db = require('../config/database'); // Conectar la base de datos MySQL
//const mysql = require('mysql2/promise');
const app = express();

// Configuración del puerto
const PORT = process.env.PORT || 3000;



const mysql = require('mysql2/promise');

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
        //console.log('Conectado a la base de datos MySQL.');
        connection.release(); // Liberar la conexión
    })
    .catch(error => {
        console.error('Error al conectar a la base de datos:', error);
    });



app.set('view engine', 'ejs');
// Establecer la ubicación de las vistas
app.set('views', path.join(__dirname, 'views'));

// Configurar el middleware cookie-parser
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
}, db.promise()); // Usa el método de promesa de MySQL2

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

// Middleware para servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Middleware para parsear el body de las solicitudes
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

// Ruta para la página de registro
app.get('/registro', sessionChecker, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'registro.html'));
});

// Ruta para la página de inicio de sesión
app.get('/login', sessionChecker, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Manejar el registro de usuarios
app.post('/registro', (req, res) => {
    const { nombre, email, password } = req.body;

    // Cifrar la contraseña antes de guardarla
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Insertar el usuario en la base de datos
    const query = 'INSERT INTO users (nombre, email, password) VALUES (?, ?, ?)';
    db.query(query, [nombre, email, hashedPassword], (err, results) => {
        if (err) {
            console.error('Error al registrar el usuario:', err.message);
            res.status(500).send('Error al registrar el usuario');
        } else {
            res.send('Usuario registrado con éxito');
        }
    });
});

// Manejar el inicio de sesión
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Buscar al usuario en la base de datos
    const query = 'SELECT * FROM users WHERE email = ?';
    db.query(query, [email], (err, results) => {
        if (err) {
            console.error('Error al buscar el usuario:', err.message);
            res.status(500).send('Error al iniciar sesión');
        } else if (results.length > 0 && bcrypt.compareSync(password, results[0].password)) {
            req.session.user_id = results[0].id;
            req.session.user = results[0];
            res.redirect('/dashboard');
        } else {
            res.status(400).send('Correo o contraseña incorrectos');
        }
    });
});

// Ruta para el tablero (área protegida)
app.get('/dashboard', (req, res) => {
    if (req.session.user && req.cookies.user_sid) {
        const servicesQuery = 'SELECT * FROM services';
        const techniciansQuery = 'SELECT * FROM technicians';

        db.query(servicesQuery, (err, services) => {
            if (err) {
                console.error('Error al obtener los servicios:', err.message);
                res.status(500).send('Error al cargar los servicios');
            } else {
                db.query(techniciansQuery, (err, technicians) => {
                    if (err) {
                        console.error('Error al obtener los técnicos:', err.message);
                        res.status(500).send('Error al cargar los técnicos');
                    } else {
                        res.render('dashboard', { services, technicians });
                    }
                });
            }
        });
    } else {
        res.redirect('/login');
    }
});


app.post('/solicitar-servicio', (req, res) => {
    const { service, technician, address } = req.body;
    const userId = req.session.user.id;

    const query = 'INSERT INTO service_requests (user_id, service_id, technician_id, address) VALUES (?, ?, ?, ?)';
    db.query(query, [userId, service, technician, address], (err, results) => {
        if (err) {
            console.error('Error al solicitar el servicio:', err.message);
            res.status(500).send('Error al solicitar el servicio');
        } else {
            res.send('Servicio solicitado con éxito');
        }
    });
});

// Ruta para obtener la lista de técnicos
app.get('/technicians', async (req, res) => {
    try {
        // Consulta a la base de datos para obtener los técnicos
        const [rows] = await pool.query('SELECT * FROM technicians');
        
        // Renderizar la vista de técnicos con los datos obtenidos
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

app.get('/requests', (req, res) => {
    if (req.session.user && req.cookies.user_sid) {
        const userId = req.session.user_id;

        const query = `
            SELECT service_requests.*, services.name AS service_name, technicians.name AS technician_name 
            FROM service_requests
            JOIN services ON service_requests.service_id = services.id
            JOIN technicians ON service_requests.technician_id = technicians.id
            WHERE service_requests.user_id = ? 
            ORDER BY service_requests.created_at DESC
        `;

        db.query(query, [userId], (err, requests) => {
            if (err) {
                console.error('Error al obtener las solicitudes:', err.message);
                res.status(500).send('Error al cargar las solicitudes');
            } else {
                res.render('requests', { requests });
            }
        });
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


// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});
