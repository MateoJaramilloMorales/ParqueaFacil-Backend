const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const bcrypt = require('bcrypt'); // 🛡️ Sistema de seguridad para contraseñas
require('dotenv').config(); 

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURACIÓN DE SUPABASE ADAPTADA A ENTORNO EN LA NUBE ---
const SB_URL = process.env.SUPABASE_URL || 'https://bnjmejydokzxkqpfqeea.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY; 
const supabase = createClient(SB_URL, SB_KEY);

const SALT_ROUNDS = 10; // Fuerza de encriptación para bcrypt

// REGLA DE NEGOCIO: Enlace directo con la variable CODIGO_ADMIN configurada en Render
const CODIGO_DUEÑO_VALIDO = process.env.CODIGO_ADMIN || "PARQUEA2026";

// ==========================================
// --- MÉTODOS GET (Consultas) --------------
// ==========================================

// Ruta principal de control
app.get('/', (req, res) => {
    res.send('🚀 Servidor de ParqueaFácil Medellín - ACTIVO Y SEGURO');
});

// Obtener todos los parqueaderos operativos
app.get('/parqueaderos', async (req, res) => {
    const { data, error } = await supabase.from('parqueaderos').select('*');
    if (error) return res.status(400).json(error);
    res.json(data);
});

// 1. OBTENER SÓLO MIS PARQUEADEROS
app.get('/mis-parqueaderos/:email', async (req, res) => {
    const { email } = req.params;
    
    if (!email || email === 'undefined') {
        return res.status(400).json({ error: "El email del administrador no es válido." });
    }
    
    try {
        const { data, error } = await supabase
            .from('parqueaderos')
            .select('*')
            .eq('admin_email', email.trim().toLowerCase());

        if (error) return res.status(400).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener parqueaderos propios." });
    }
});

// 2. OBTENER HISTORIAL DE RESERVAS FILTRADO PARA UN ADMINISTRADOR
app.get('/mis-reservas/:email', async (req, res) => {
    const { email } = req.params;
    
    if (!email || email === 'undefined') {
        return res.status(400).json({ error: "El email del administrador no es válido." });
    }
    
    try {
        const { data: misParqueaderos, error: pError } = await supabase
            .from('parqueaderos')
            .select('id, nombre')
            .eq('admin_email', email.trim().toLowerCase());

        if (pError) return res.status(400).json({ error: pError.message });
        if (!misParqueaderos || misParqueaderos.length === 0) {
            return res.json([]); 
        }

        const listaIds = misParqueaderos.map(p => p.id);

        const { data: reservas, error: rError } = await supabase
            .from('reservas')
            .select('*')
            .in('parqueadero_id', listaIds)
            .order('created_at', { ascending: false });

        if (rError) return res.status(400).json({ error: rError.message });

        const resultadoAdaptado = reservas.map(r => {
            const pEncontrado = misParqueaderos.find(p => p.id === r.parqueadero_id);
            return {
                ...r,
                parqueaderos: {
                    nombre: pEncontrado ? pEncontrado.nombre : 'Parqueadero Eliminado'
                }
            };
        });

        res.json(resultadoAdaptado);
    } catch (err) {
        res.status(500).json({ error: "Error en procesamiento interno de reservas filtradas." });
    }
});

// Obtener la reserva activa exclusiva de un conductor
app.get('/reserva-activa/:email', async (req, res) => {
    const { email } = req.params;
    const { data, error } = await supabase
        .from('reservas')
        .select('*')
        .eq('usuario_email', email.trim().toLowerCase())
        .eq('estado', 'activa') 
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) return res.status(400).json(error);
    res.json(data);
});

// Historial general de reservas (Solo para Super-Admin de la App)
app.get('/historial-reservas', async (req, res) => {
    try {
        const { data: reservas, error: resError } = await supabase
            .from('reservas')
            .select('*')
            .order('created_at', { ascending: false });

        if (resError) throw resError;

        const { data: parqueaderos, error: pError } = await supabase
            .from('parqueaderos')
            .select('id, nombre');

        if (pError) throw pError;

        const historialCombinado = reservas.map(reserva => {
            const parqueaderoAsociado = parqueaderos.find(p => p.id === reserva.parqueadero_id);
            return {
                ...reserva,
                parqueaderos: {
                    nombre: parqueaderoAsociado ? parqueaderoAsociado.nombre : 'Parqueadero Desconocido'
                }
            };
        });

        res.json(historialCombinado);
    } catch (e) {
        console.error("❌ Error al obtener historial general:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// Historial aislado de un solo cliente
app.get('/historial-reservas-cliente/:email', async (req, res) => {
    const { email } = req.params;
    try {
        const { data: reservas, error: resError } = await supabase
            .from('reservas')
            .select('*')
            .eq('usuario_email', email.trim().toLowerCase())
            .order('created_at', { ascending: false });

        if (resError) throw resError;

        const { data: parqueaderos, error: pError } = await supabase
            .from('parqueaderos')
            .select('id, nombre');

        if (pError) throw pError;

        const historialCliente = reservas.map(reserva => {
            const parqueaderoAsociado = parqueaderos.find(p => p.id === reserva.parqueadero_id);
            return {
                ...reserva,
                parqueaderos: {
                    nombre: parqueaderoAsociado ? parqueaderoAsociado.nombre : 'Parqueadero Desconocido'
                }
            };
        });

        res.json(historialCliente);
    } catch (e) {
        console.error("❌ Error al obtener historial del cliente:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// Dashboard de métricas exclusivo para el dueño del parqueadero
app.get('/admin/metricas/:parqueadero_id', async (req, res) => {
    const { parqueadero_id } = req.params;
    try {
        const { data: p, error: pError } = await supabase.from('parqueaderos').select('cupos_totales, cupos_disponibles').eq('id', parqueadero_id).single();
        if (pError || !p) return res.status(404).json({ error: "Parqueadero no encontrado" });

        const { data: reservas, error: rError } = await supabase.from('reservas').select('total_pago').eq('parqueadero_id', parqueadero_id).eq('estado', 'completada');
        if (rError) throw rError;

        const ingresosTotales = reservas.reduce((sum, res) => sum + (res.total_pago || 0), 0);
        const celdasOcupadas = p.cupos_totales - p.cupos_disponibles;
        const porcentajeOcupacion = p.cupos_totales > 0 ? Math.round((celdasOcupadas / p.cupos_totales) * 100) : 0;

        res.json({
            id_parqueadero: parqueadero_id,
            ingresos_totales: ingresosTotales,
            ocupacion_actual: `${porcentajeOcupacion}%`,
            cupos_disponibles: p.cupos_disponibles
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// ==========================================
// --- MÉTODOS POST (Creaciones y Acciones) -
// ==========================================

// Autenticación: Login Seguro con Bcrypt
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: "El correo y la contraseña son obligatorios." });
    }

    const correoLimpio = email.trim().toLowerCase();
    
    const { data: usuario, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('email', correoLimpio)
        .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!usuario) return res.status(401).json({ error: "Correo o contraseña incorrectos" });

    const passwordCorrecto = await bcrypt.compare(password, usuario.password);
    if (!passwordCorrecto) return res.status(401).json({ error: "Correo o contraseña incorrectos" });

    const { password: _, ...usuarioSeguro } = usuario;
    res.json(usuarioSeguro);
});

// Autenticación: Registro Seguro con Variables Vinculadas
app.post('/registro', async (req, res) => {
    const { nombre, email, password, rol, codigo_admin } = req.body;
    
    if (!nombre || !email || !password || !rol) {
        return res.status(400).json({ error: "Todos los campos (nombre, email, password, rol) son obligatorios." });
    }

    // 🛡️ CAPA DE SEGURIDAD REVISADA: Validación estricta con la constante del entorno
    if (rol === 'admin') {
        if (!codigo_admin) {
            return res.status(400).json({ error: "El código de acceso es requerido para registrarse como Dueño." });
        }
        if (codigo_admin.trim().toUpperCase() !== CODIGO_DUEÑO_VALIDO.trim().toUpperCase()) {
            return res.status(403).json({ error: "Código de acceso inválido. No tienes autorización corporativa." });
        }
    }
    
    try {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const { data, error } = await supabase
            .from('usuarios')
            .insert([{ 
                nombre: nombre.trim(), 
                email: email.trim().toLowerCase(), 
                password: hashedPassword, 
                rol 
            }])
            .select();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: "Este correo electrónico ya se encuentra registrado." });
            }
            return res.status(400).json({ error: error.message });
        }
        res.status(201).json(data);
    } catch (e) {
        res.status(500).json({ error: "Error en el proceso de registro del servidor" });
    }
});

// Registrar parqueadero
app.post('/parqueaderos', async (req, res) => {
    const {
        nombre, direccion, cupos_totales, cupos_disponibles,
        lat, lng, precio, metodo_pago, fotos, estado_operacion, tipo_vehiculo, admin_email
    } = req.body;

    if (!nombre || !precio || !admin_email) {
        return res.status(400).json({ error: "Faltan parámetros obligatorios (nombre, precio o admin_email)." });
    }

    try {
        const { data, error } = await supabase
            .from('parqueaderos')
            .insert([{
                nombre,
                direccion: direccion || "Ubicación seleccionada",
                cupos_totales: parseInt(cupos_totales) || 0,
                cupos_disponibles: parseInt(cupos_disponibles) || 0,
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                precio: parseFloat(precio),
                metodo_pago,
                fotos: fotos || [],
                estado_operacion: estado_operacion || 'abierto',
                tipo_vehiculo: tipo_vehiculo || 'ambos',
                admin_email: admin_email.trim().toLowerCase()
            }])
            .select();

        if (error) return res.status(400).json({ error: error.message });
        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: "Error interno al crear parqueadero." });
    }
});

// Registrar una nueva reserva de cupo
app.post('/reservar-cupo', async (req, res) => {
    const { id, cantidad, tiempoHoras, tipo, usuario_email, usuario_nombre, metodo } = req.body;
    const TIEMPO_MS = tiempoHoras * 60 * 60 * 1000;

    try {
        const { data: p, error: pError } = await supabase.from('parqueaderos').select('*').eq('id', id).single();
        
        if (pError || !p) {
            return res.status(404).json({ error: "Parqueadero no encontrado" });
        }

        if (p.tipo_vehiculo && p.tipo_vehiculo !== 'ambos') {
            if (p.tipo_vehiculo !== tipo) {
                return res.status(400).json({ 
                    error: `Este parqueadero está registrado para: Solo ${p.tipo_vehiculo}s.` 
                });
            }
        }

        if (p.cupos_disponibles < cantidad) {
            return res.status(400).json({ error: "Cupos insuficientes" });
        }

        const totalCalculado = Math.round(p.precio * (tipo === 'moto' ? 0.5 : 1.0) * cantidad * tiempoHoras);
        
        const { data: resData, error: resError } = await supabase.from('reservas').insert([{
            parqueadero_id: id, 
            usuario_email: usuario_email ? usuario_email.trim().toLowerCase() : 'sin@email.com', 
            usuario_nombre: usuario_nombre || 'Usuario Desconocido',
            vehiculo_tipo: tipo,
            cantidad_celdas: cantidad, 
            horas_reservadas: tiempoHoras,
            total_pago: totalCalculado, 
            metodo_pago: metodo, 
            estado: 'activa'
        }]).select();

        if (resError) return res.status(400).json({ error: resError.message });

        await supabase.from('parqueaderos')
            .update({ cupos_disponibles: p.cupos_disponibles - cantidad })
            .eq('id', id);

        setTimeout(async () => {
            const { data: reservaActual } = await supabase.from('reservas').select('estado').eq('id', resData[0].id).single();
            if (reservaActual && reservaActual.estado === 'activa') {
                const { data: pCheck } = await supabase.from('parqueaderos').select('cupos_disponibles').eq('id', id).single();
                if (pCheck) {
                    await supabase.from('parqueaderos').update({ cupos_disponibles: pCheck.cupos_disponibles + cantidad }).eq('id', id);
                    await supabase.from('reservas').update({ estado: 'completada' }).eq('id', resData[0].id);
                    console.log(`⏰ Cupos liberados automáticamente para parqueadero ID: ${id}`);
                }
            }
        }, TIEMPO_MS);

        res.json({ success: true, data: resData });

    } catch (e) {
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// CANCELAR RESERVA (Admin/User)
app.post('/cancelar-reserva/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const { data: reserva, error: rError } = await supabase
            .from('reservas')
            .select('parqueadero_id, cantidad_celdas, estado')
            .eq('id', id)
            .single();

        if (rError || !reserva) return res.status(404).json({ error: "Reserva no encontrada" });

        if (reserva.estado !== 'activa') {
            await supabase.from('reservas').update({ estado: 'cancelada' }).eq('id', id);
            return res.json({ success: true });
        }

        await supabase.from('reservas').update({ estado: 'cancelada' }).eq('id', id);

        const { data: p } = await supabase
            .from('parqueaderos')
            .select('cupos_disponibles')
            .eq('id', reserva.parqueadero_id)
            .single();

        if (p) {
            await supabase.from('parqueaderos')
                .update({ cupos_disponibles: p.cupos_disponibles + reserva.cantidad_celdas })
                .eq('id', reserva.parqueadero_id);
        }

        res.json({ success: true, message: "Reserva cancelada y cupos liberados." });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// AUMENTAR / EXTENDER RESERVA (Admin)
app.post('/extender-reserva/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { data: reserva, error: rError } = await supabase
            .from('reservas')
            .select('*, parqueaderos(precio)')
            .eq('id', id)
            .single();

        if (rError || !reserva) return res.status(404).json({ error: "Reserva no encontrada." });
        if (reserva.estado !== 'activa') return res.status(400).json({ error: "Solo se pueden extender reservas activas." });

        const precioHoraBase = reserva.parqueaderos?.precio || 0;
        const tipoVehiculo = reserva.vehiculo_tipo;
        const celdas = reserva.cantidad_celdas;
        
        const factorTipo = tipoVehiculo === 'moto' ? 0.5 : 1.0;
        const costoHoraExtra = Math.round(precioHoraBase * factorTipo * celdas);

        const nuevasHoras = reserva.horas_reservadas + 1;
        const nuevoTotal = reserva.total_pago + costoHoraExtra;

        const { data: updated, error: uError } = await supabase
            .from('reservas')
            .update({
                horas_reservadas: nuevasHoras,
                total_pago: nuevoTotal
            })
            .eq('id', id)
            .select();

        if (uError) throw uError;
        res.json({ success: true, data: updated });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Liberar cupo manual
app.post('/liberar-cupo', async (req, res) => {
    const { id, cantidad } = req.body;
    const { data: p } = await supabase.from('parqueaderos').select('cupos_disponibles').eq('id', id).single();
    if (p) {
        await supabase.from('parqueaderos').update({ cupos_disponibles: p.cupos_disponibles + cantidad }).eq('id', id);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "No encontrado" });
    }
});


// ==========================================
// --- MÉTODOS PUT (Actualizaciones) --------
// ==========================================

// GESTIÓN DE PERFILES: Actualiza Nombre y Contraseña. Correo Electrónico Bloqueado.
app.put('/usuarios/:email', async (req, res) => {
    const emailUsuario = req.params.email.trim().toLowerCase();
    const { nombre, password } = req.body;

    try {
        let updateData = {};
        
        if (nombre && nombre.trim() !== '') {
            updateData.nombre = nombre.trim();
        }
        
        if (password) {
            updateData.password = await bcrypt.hash(password, SALT_ROUNDS);
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: "No se proporcionaron datos nuevos para actualizar." 
            });
        }

        const { data, error: errorUpdate } = await supabase
            .from('usuarios')
            .update(updateData)
            .eq('email', emailUsuario)
            .select();

        if (errorUpdate) {
            return res.status(400).json({ success: false, error: errorUpdate.message });
        }

        if (data && data.length > 0) {
            const { password: _, ...usuarioActualizado } = data[0];
            return res.json({ 
                success: true, 
                message: "Perfil actualizado con éxito.",
                user: usuarioActualizado 
            });
        }

        res.status(404).json({ 
            success: false, 
            error: "No se encontró el usuario en la base de datos." 
        });

    } catch (e) {
        res.status(500).json({ success: false, error: "Error interno del servidor." });
    }
});

// Modificar tiempo/pago de una reserva de forma libre
app.put('/modificar-reserva/:id', async (req, res) => {
    const { id } = req.params;
    const { horas_reservadas, total_pago } = req.body;

    try {
        const { data, error = null } = await supabase
            .from('reservas')
            .update({ 
                horas_reservadas: parseInt(horas_reservadas), 
                total_pago: Math.round(total_pago) 
            })
            .eq('id', id)
            .select();

        if (error) throw error;
        res.json({ success: true, data });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// Actualizar el estado operativo del parqueadero
app.put('/parqueaderos/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { estado_operacion } = req.body;

    const { error } = await supabase
        .from('parqueaderos')
        .update({ estado_operacion })
        .eq('id', id);

    if (error) {
        return res.status(500).json({ error: "No se pudo actualizar el estado" });
    }
    res.json({ success: true, message: "Estado actualizado con éxito" });
});


// ==========================================
// --- MÉTODOS DELETE (Eliminaciones) -------
// ==========================================

// Eliminar un usuario
app.delete('/usuarios/:email', async (req, res) => {
    const { email } = req.params;
    const { error } = await supabase.from('usuarios').delete().eq('email', email.trim().toLowerCase());
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true });
});

// Eliminar un parqueadero
app.delete('/parqueaderos/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('parqueaderos').delete().eq('id', id);
    if (error) return res.status(400).json(error);
    res.json({ success: true });
});

// BORRAR RESERVA (Admin)
app.delete('/borrar-reserva/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { data: reserva } = await supabase.from('reservas').select('*').eq('id', id).single();
        
        if (reserva && reserva.estado === 'activa') {
            const { data: p } = await supabase.from('parqueaderos').select('cupos_disponibles').eq('id', reserva.parqueadero_id).single();
            if (p) {
                await supabase.from('parqueaderos').update({ cupos_disponibles: p.cupos_disponibles + reserva.cantidad_celdas }).eq('id', reserva.parqueadero_id);
            }
        }

        const { error } = await supabase.from('reservas').delete().eq('id', id);
        if (error) return res.status(400).json({ error: error.message });

        res.json({ success: true, message: "Reserva eliminada físicamente de la base de datos." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- INICIALIZACIÓN DEL ENTORNO ADAPTADA PARA PRODUCCIÓN ---
const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ SERVIDOR PARQUEAFÁCIL DESPLEGADO EXITOSAMENTE`);
    console.log(`🚀 Escuchando peticiones globales en el puerto: ${PORT}`);
});

module.exports = app;