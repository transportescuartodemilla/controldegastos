# Solvento Finanzas — Panel Administrativo Empresarial

Panel administrativo moderno diseñado para el control integral de **ingresos, egresos, reportes periódicos (diarios, semanales, mensuales) y gestión de empleados**, con la estética visual limpia y minimalista de **Solvento** (`carriers.solvento.mx`).

---

## 🚀 Inicio Rápido

El servidor ya se encuentra configurado y listo para usarse.

### 1. Iniciar el servidor
En tu terminal dentro de esta carpeta, ejecuta:
```bash
npm start
```
*(O también: `node server.js`)*

### 2. Abrir en tu navegador
Abre Safari, Chrome o tu navegador favorito en:
```
http://localhost:3000
```
> **Nota:** La aplicación también funciona en modo autónomo abriendo directamente el archivo `public/index.html` en tu navegador.

---

## 💎 Características Principales

### 1. Estética Idéntica a Solvento
- **Barra lateral ultra-limpia:** Navegación por iconos verticales (Ingresos, Egresos, Reportes, Empleados, Configuración).
- **Las 3 Entradas Superiores Solvento (KPIs):**
  - **`1` Ingresos:** Total facturado y cobrado con desglose rápido (*Disponible / En dispersión / Pagado*).
  - **`2` Egresos:** Total de costos y gastos operativos de la empresa.
  - **`3` Resumen:** Balance neto y margen porcentual con **selector rápido integrado `[Diario]` `[Semanal]` `[Mensual]`**.
- **Banner de Estado Solvento:** Franja redondeada con resumen financiero y avisos de liquidez.

### 2. Registro Simple y Unificado de Ingresos y Egresos (Estilo Móvil)
- **Modal Unificado Ultra-Simple:** Inspirado en las aplicaciones móviles financieras más limpias del mercado (estilo 1Money / Bluecoins).
- **Selector Segmentado Superior de 1 Toque:**
  - `[ Ingreso ]` (tema azul): Con selección de proyecto y cálculo fiscal automático (Neto, IVA, ISR, SAT).
  - `[ Gasto ]` (tema coral/rojo): Registro instantáneo de egreso con selección de categoría y cuenta.
  - `[ Transferencia ]` (tema verde): Traspasos entre cuentas o caja chica.
- **Campos Limpios y Lineales:**
  - `Fecha`: Selector con botón de repetición.
  - `Importe`: Entrada limpia y directa.
  - `Proyecto`: De qué proyecto proviene el ingreso (auto-rellena cliente y descripción).
  - `Impuestos`: Desglose automático de IVA, ISR y total a declarar ante el SAT.
  - `Categoría`: Desplegable adaptativo según sea Ingreso o Gasto.
  - `Cuenta`: Banco, SPEI, Tarjeta, Efectivo o Cheque.
  - `Nota`: No. de Factura / Folio o referencia.
  - `Descripción`: Concepto con botón para adjuntar comprobante / foto.
- **Botones de Acción:**
  - `Guardar`: Guarda la transacción y cierra el modal.
  - `Continuar`: Guarda la transacción y mantiene el formulario listo para capturar la siguiente rápidamente.

### 3. Directorio de Proyectos de Ingreso Activos
- Registro y seguimiento de clientes, contratos o proyectos activos de los cuales se obtienen ingresos actualmente.
- Botón directo `+ Registrar Cobro` en cada tarjeta de proyecto para abrir el formulario con el proyecto y cliente preseleccionados.

### 4. Control de Gastos y Egresos Operativos
- Registro de gastos clasificados por categorías claras (*Nómina y Sueldos, Servidores y Nube, Herramientas y Software, Oficina, Marketing, Viáticos, Impuestos*).
- Formulario ágil sin campos innecesarios.
- Registro de gastos clasificados por categorías claras (*Nómina y Sueldos, Servidores y Nube, Herramientas y Software, Oficina, Marketing, Viáticos, Impuestos*).
- Formulario ágil sin campos innecesarios.

### 4. Reportes Diarios, Semanales y Mensuales
- Selector dinámico de periodicidad: **Diario**, **Semanal** y **Mensual**.
- Gráfico interactivo SVG de barras comparativas (Ingresos vs Gastos en el tiempo).
- Desglose de gastos por categoría porcentual.
- Botón para **Descargar sábana de datos en CSV / Excel**.
- Botón para **Imprimir o Guardar en PDF** con diseño ejecutivo listo para imprimir.

### 5. Gestión de Usuarios para Empleados
- Directorio de colaboradores de la empresa.
- Asignación de roles con diferentes niveles de acceso:
  - **Administrador:** Control total de la plataforma.
  - **Contador / Finanzas:** Registro y conciliación de movimientos.
  - **Gestor Operativo:** Supervisión de flujo de caja.
  - **Empleado:** Consulta y carga de comprobantes.
- Contador de operaciones registradas por empleado y estados Activo / Inactivo.

### 6. Base de Datos SQLite Local y Persistente
- Todos los datos se guardan en el archivo `finanzas.db` en tu Mac, sin depender de servicios externos o suscripciones en la nube.
