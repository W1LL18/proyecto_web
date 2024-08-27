const express = require('express');
const app = express();

// Configuración del puerto
const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON
app.use(express.json());

// Ruta básica
app.get('/', (req, res) => {
    res.send('Bienvenido a la plataforma de reparaciones');
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});
