// app.test.js
const request = require('supertest');
const express = require('express');

// Mock rápido del servidor para validar las reglas de negocio de ParqueaFácil
const app = express();
app.use(express.json());

// Simulación exacta de tu lógica de registro por roles
app.post('/registro', (req, res) => {
  const { rol, codigo_admin } = req.body;
  if (rol === 'admin' && (!codigo_admin || codigo_admin.trim().toUpperCase() !== 'PARQUEA2026')) {
    return res.status(400).json({ error: 'Código de administrador inválido o ausente.' });
  }
  return res.status(201).json({ mensaje: 'Usuario registrado exitosamente.' });
});

describe('🧪 PRUEBAS UNITARIAS: REGLAS DE NEGOCIO (PARQUEAFÁCIL)', () => {
  
  // 🟢 CASO POSITIVO: Conductor común
  it('Debería registrar un Conductor común (driver) sin exigir código especial', async () => {
    const res = await request(app)
      .post('/registro')
      .send({
        nombre: 'Mateo Conductor',
        email: 'mateo.driver@gmail.com',
        rol: 'driver'
      });
    expect(res.statusCode).toEqual(201);
    expect(res.body.mensaje).toBe('Usuario registrado exitosamente.');
  });

  // 🟢 CASO POSITIVO: Admin con clave correcta
  it('Debería autorizar el registro de un Administrador si usa el código maestro válido', async () => {
    const res = await request(app)
      .post('/registro')
      .send({
        nombre: 'Mateo Admin',
        email: 'mateo.owner@gmail.com',
        rol: 'admin',
        codigo_admin: 'PARQUEA2026' // Coincide exactamente con tu variable de entorno
      });
    expect(res.statusCode).toEqual(201);
  });

  // 🔴 CASO NEGATIVO: Admin con clave errónea
  it('Debería bloquear con error 400 si un usuario intenta registrarse como admin con clave incorrecta', async () => {
    const res = await request(app)
      .post('/registro')
      .send({
        nombre: 'Fraude Admin',
        email: 'fraude@gmail.com',
        rol: 'admin',
        codigo_admin: 'CLAVE_FALSA_123'
      });
    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toContain('Código de administrador inválido');
  });
});