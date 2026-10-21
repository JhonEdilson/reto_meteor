// Entradas de cotizar_pedido para los escenarios de dinero del spec (§11) y los rechazos.
// Fuente única para las dos pruebas: probar_calcular.mjs (local) y probar_flujo_api.mjs (Meteor).
// Los totales y tiempos esperados son los de totales_esperados.py.
const L = (codigo, cantidad = 1, extra = {}) => ({ codigo, cantidad, ...extra });
const AD = (codigo, cantidad = 1) => ({ codigo, cantidad });
const LOCAL = 'Recoger en el local';

// nombre: [lineas, tipo, zona, total esperado, tiempo esperado, texto que debe traer el detalle de cocina (opcional)]
export const casos = {
  E01: [[L('HAM-03', 1, { adiciones: [AD('AD-01'), AD('AD-02')] }), L('BEB-01')], 'domicilio', 'Laureles', 39000, 28],
  E02: [[L('COM-01', 1, { bebida_combo: 'BEB-04', adiciones: [AD('AD-01')] })], 'recoger', LOCAL, 33500, 15],
  E03: [[L('PER-02', 1, { adiciones: [AD('AD-01', 2)] })], 'domicilio', 'Estadio', 24000, 20],
  E05: [[L('PIC-02', 1, { adiciones: [AD('AD-08')] })], 'domicilio', 'Conquistadores', 54000, 45],
  E06: [[L('SAL-02')], 'recoger', LOCAL, 22000, 15],
  E07: [[L('SAL-01', 2)], 'domicilio', 'Belén', 33000, 32],
  E09: [[L('PER-01', 2)], 'domicilio', 'Centro', 30000, 33],
  E11: [[L('PER-01'), L('BEB-01')], 'domicilio', 'Laureles', 19000, 18],
  E12: [[L('SAL-01')], 'recoger', LOCAL, 14000, 12],
  E15: [[L('HAM-04'), L('HAM-03', 1, { adiciones: [AD('AD-03')] }), L('BEB-05', 1, { en_leche: true, nota: 'de mora' })], 'domicilio', 'La América', 65000, 38,
        '1 x Jugo natural en leche · de mora'],
  E17: [[L('HAM-02', 1, { adiciones: [AD('AD-04')] })], 'recoger', LOCAL, 21500, 15],
  E18: [[L('SAL-01', 1, { adiciones: [AD('AD-08')] })], 'domicilio', 'Laureles', 22000, 22],
};

// nombre: [lineas, tipo, zona, texto que debe aparecer en algún error]
export const rechazos = {
  'mínimo': [[L('PER-01')], 'domicilio', 'Laureles', 'mínimo'],
  'cerveza': [[L('BEB-06')], 'recoger', LOCAL, 'solo para tomar en el local'],
  'Poblado': [[L('PIC-02')], 'domicilio', 'El Poblado', 'No hay domicilio a El Poblado'],
  'zona inventada': [[L('PIC-02')], 'domicilio', 'Envigado', 'zona_desconocida'],
  'aguacate agotado': [[L('HAM-02', 1, { adiciones: [AD('AD-06')] })], 'recoger', LOCAL, 'no está disponible'],
  'tocineta a perro': [[L('PER-01', 1, { adiciones: [AD('AD-02')] })], 'recoger', LOCAL, 'no se le puede agregar'],
  'salsa a bebida': [[L('BEB-03', 1, { adiciones: [AD('AD-09')] })], 'recoger', LOCAL, 'no se le puede agregar'],
  'queso x3': [[L('HAM-02', 1, { adiciones: [AD('AD-01', 3)] })], 'recoger', LOCAL, 'máximo 2'],
  'código inventado': [[L('HAM-01')], 'recoger', LOCAL, 'No existe el producto HAM-01'],
  'cantidad 25': [[L('HAM-02', 25)], 'recoger', LOCAL, 'Cantidad no válida'],
  'leche a limonada': [[L('BEB-03', 1, { en_leche: true })], 'recoger', LOCAL, 'en leche'],
  'pedido vacío': [[], 'recoger', LOCAL, 'no trae productos'],
};
