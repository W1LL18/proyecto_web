const mysql = require('mysql2');

// Crear la conexión a la base de datos
const db = mysql.createConnection({
    host: 'localhost',        // Cambia esto si tu servidor MySQL está en otro lugar
    user: 'root',             // Tu usuario de MySQL
    password: '@180899W', // La contraseña que usaste durante la instalación de MySQL
    database: 'proyecto_web'
});

// Conectar a la base de datos
db.connect((err) => {
    if (err) {
        console.error('Error al conectar con la base de datos:', err.message);
    } else {
        console.log('Conectado a la base de datos MySQL');
    }
});

module.exports = db;
