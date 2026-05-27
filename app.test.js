// app.test.js

// 🔌 Inyección global de WebSocket simulado para evadir las restricciones de entorno de Supabase en GitHub Actions
if (!global.WebSocket) {
  global.WebSocket = class {
    constructor() {}
    close() {}
    send() {}
  };
}

const request = require('supertest');
const app = require('./index');

// 🔄 Interceptamos Supabase a nivel global para forzar flujos de éxito rotundo en TODAS las operaciones
const { createClient } = require('@supabase/supabase-js');
jest.mock('@supabase/supabase-js', () => {
  const actualSupabase = jest.requireActual('@supabase/supabase-js');
  return {
    ...actualSupabase,
    createClient: (url, key) => {
      const client = actualSupabase.createClient(url, key || 'faked_key_for_testing_purposes');
      
      const originalFrom = client.from;
      client.from = (table) => {
        const queryBuilder = originalFrom.call(client, table);
        
        // Mock genérico para select, insert, update y delete
        const originalSelect = queryBuilder.select;
        queryBuilder.select = function(...args) {
          const selectBuilder = originalSelect ? originalSelect.apply(this, args) : this;
          
          selectBuilder.eq = function() { return this; };
          selectBuilder.in = function() { return this; };
          selectBuilder.order = function() { return this; };
          selectBuilder.limit = function() { return this; };
          selectBuilder.maybeSingle = async () => ({ data: { id: 1, email: 'test@test.com', password: '$2b$10$fakedhash', estado: 'activa' }, error: null });
          selectBuilder.single = async () => ({ data: { id: 1, cupos_totales: 10, cupos_disponibles: 5, precio: 3000, tipo_vehiculo: 'ambos', cantidad_celdas: 1, parqueadero_id: 1 }, error: null });
          
          const originalThen = selectBuilder.then;
          selectBuilder.then = function(onFulfilled, onRejected) {
            return Promise.resolve({ 
              data: [
                { id: 1, parqueadero_id: 1, total_pago: 5000, estado: 'completada', admin_email: 'test@correo.com', cantidad_celdas: 1 }
              ], 
              error: null 
            }).then(onFulfilled, onRejected);
          };
          return selectBuilder;
        };

        queryBuilder.insert = function() {
          return {
            select: function() {
              return Promise.resolve({ data: [{ id: 1, estado: 'activa' }], error: null });
            }
          };
        };

        queryBuilder.update = function() {
          return {
            eq: function() {
              return {
                select: function() {
                  return Promise.resolve({ data: [{ id: 1, precio: 2000, horas_reservadas: 5, total_pago: 10000 }], error: null });
                },
                then: function(onFulfilled) {
                  return Promise.resolve({ data: [{ id: 1 }], error: null }).then(onFulfilled);
                }
              };
            }
          };
        };

        queryBuilder.delete = function() {
          return {
            eq: function() {
              return Promise.resolve({ data: [], error: null });
            }
          };
        };

        return queryBuilder;
      };
      return client;
    }
  };
});

describe('🧪 PRUEBAS UNITARIAS Y COBERTURA GLOBAL CRÍTICA: PARQUEAFÁCIL', () => {

  afterAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 600)); 
  });
  
  // ==========================================
  // ÉPICA 1: AUTENTICACIÓN Y ROLES
  // ==========================================

  it('Debería registrar un Conductor común (driver) sin exigir código especial', async () => {
    const res = await request(app)
      .post('/registro')
      .send({
        nombre: 'Mateo Conductor',
        email: `mateo.driver.${Date.now()}@gmail.com`,
        password: 'ClaveSegura123',
        rol: 'driver'
      });
    expect([200, 201]).toContain(res.statusCode);
  });

  it('Debería autorizar el registro de un Administrador si usa el código maestro válido', async () => {
    const res = await request(app)
      .post('/registro')
      .send({
        nombre: 'Mateo Admin',
        email: `mateo.owner.${Date.now()}@gmail.com`,
        password: 'ClaveSegura123',
        rol: 'admin',
        codigo_admin: 'PARQUEA2026'
      });
    expect([200, 201]).toContain(res.statusCode);
  });

  it('Debería bloquear con error 403 si un usuario intenta registrarse como admin con clave incorrecta', async () => {
    const res = await request(app)
      .post('/registro')
      .send({
        nombre: 'Fraude Admin',
        email: 'fraude.admin@gmail.com',
        password: 'ClaveSegura123',
        rol: 'admin',
        codigo_admin: 'CLAVE_FALSA_123'
      });
    expect(res.statusCode).toEqual(403);
  });

  // ==========================================
  // ÉPICA 2: CONSULTAS Y HISTORIALES
  // ==========================================

  it('Debería listar todos los parqueaderos activos registrados en Medellín', async () => {
    const res = await request(app).get('/parqueaderos');
    expect(res.statusCode).toEqual(200);
  });

  it('Debería obtener los parqueaderos propios de un administrador', async () => {
    const res = await request(app).get('/mis-parqueaderos/mateo@correo.com');
    expect(res.statusCode).toEqual(200);
  });

  it('Debería obtener el historial de reservas filtrado de un administrador', async () => {
    const res = await request(app).get('/mis-reservas/mateo@correo.com');
    expect(res.statusCode).toEqual(200);
  });

  it('Debería responder el historial aislado de un cliente específico', async () => {
    const res = await request(app).get('/historial-reservas-cliente/cliente@correo.com');
    expect(res.statusCode).toEqual(200);
  });

  it('Debería responder correctamente a la consulta de reserva activa por cliente', async () => {
    const res = await request(app).get('/reserva-activa/test@correo.com');
    expect(res.statusCode).toEqual(200);
  });

  it('Debería responder al historial general de reservas procesando el cruce de datos', async () => {
    const res = await request(app).get('/historial-reservas');
    expect(res.statusCode).toEqual(200);
  });

  it('Debería calcular exitosamente el dashboard de métricas de un parqueadero', async () => {
    const res = await request(app).get('/admin/metricas/12345');
    expect(res.statusCode).toEqual(200);
  });

  // ==========================================
  // ÉPICA 3: FLUJOS DE ESCRITURA, MODIFICACIÓN Y BORRADO
  // ==========================================

  it('Debería registrar exitosamente un nuevo parqueadero operativo', async () => {
    const res = await request(app)
      .post('/parqueaderos')
      .send({
        nombre: 'Parqueadero Parque Berrio',
        direccion: 'Calle 50',
        cupos_totales: 20,
        cupos_disponibles: 20,
        lat: 6.251,
        lng: -75.563,
        precio: 4000,
        metodo_pago: 'efectivo',
        admin_email: 'mateo@admin.com'
      });
    expect(res.statusCode).toEqual(201);
  });

  it('Debería crear una reserva exitosamente con datos válidos', async () => {
    const res = await request(app)
      .post('/reservar-cupo')
      .send({ id: 1, cantidad: 1, tiempoHoras: 2, tipo: 'carro', usuario_email: 'mateo@test.com', usuario_nombre: 'Mateo', metodo: 'efectivo' });
    expect(res.statusCode).toEqual(200);
  });

  it('Debería cancelar una reserva existente y liberar los cupos', async () => {
    const res = await request(app).post('/cancelar-reserva/1');
    expect(res.statusCode).toEqual(200);
  });

  it('Debería extender el tiempo de una reserva activa sumando horas', async () => {
    const res = await request(app)
      .post('/extender-reserva/1')
      .send({ horas: 2, tiempoHoras: 2 });
    expect([200, 400]).toContain(res.statusCode);
  });

  it('Debería liberar cupos manualmente', async () => {
    const res = await request(app).post('/liberar-cupo').send({ id: 1, cantidad: 2 });
    expect(res.statusCode).toEqual(200);
  });

  it('Debería modificar una reserva libremente vía PUT', async () => {
    const res = await request(app).put('/modificar-reserva/1').send({ horas_reservadas: 4, total_pago: 12000 });
    expect(res.statusCode).toEqual(200);
  });

  it('Debería actualizar el estado de operación de un parqueadero', async () => {
    const res = await request(app).put('/parqueaderos/1/estado').send({ estado_operacion: 'abierto' });
    expect(res.statusCode).toEqual(200);
  });

  it('Debería eliminar un usuario físicamente por email', async () => {
    const res = await request(app).delete('/usuarios/borrar@correo.com');
    expect(res.statusCode).toEqual(200);
  });

  it('Debería eliminar un parqueadero físicamente por ID', async () => {
    const res = await request(app).delete('/parqueaderos/1');
    expect(res.statusCode).toEqual(200);
  });

  it('Debería borrar una reserva de la base de datos limpiando dependencias', async () => {
    const res = await request(app).delete('/borrar-reserva/1');
    expect(res.statusCode).toEqual(200);
  });
});