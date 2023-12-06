var axios = require('axios');

// Generar una clave de idempotencia única
function generateIdempotencyKey() {
  // Puedes usar una biblioteca como 'uuid' o simplemente generar una cadena aleatoria
  // en función de la fecha actual o algún otro identificador único.
  const uniqueValue = Date.now().toString(); // Usando la marca de tiempo actual como ejemplo
  return uniqueValue;
}

exports.generarFactura = async (req, res) => {
    try {
        console.log("Inicio de la función");

        if (!req.body || !req.body.event || !req.body.event.pulseId) {
            throw new Error('La solicitud no contiene la estructura esperada de un evento de Monday.com');
        }

        const itemId = req.body.event.pulseId;

        const query = `query {
            items(ids: [${itemId}]) {
                column_values {
                    id
                    type
                    value
                    text
                }
            }
        }`;

        console.log("Antes de la solicitud a Monday.com");

        let mondayResponse = await axios.post('https://api.monday.com/v2', {
            query: query
        }, {
            headers: {
              'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjIzMjg3MzUyNCwiYWFpIjoxMSwidWlkIjoyMzUzNzM2NCwiaWFkIjoiMjAyMy0wMS0zMVQyMTowMjoxNy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6OTUwNzUxNiwicmduIjoidXNlMSJ9.lX1RYu90B2JcH0QxITaF8ymd4d6dBes0FJHPI1mzSRE',
              'Content-Type': 'application/json'
            }
        });

        console.log("Respuesta de Monday.com:", mondayResponse.data);

        // Procesar datos de las columnas de Monday.com
        const columnsData = mondayResponse.data.data.items[0].column_values;
        const valorArriendoColumn = columnsData.find(column => column.id === 'n_meros');
        const comisionRateColumn = columnsData.find(column => column.id === 'n_meros0');
        const gastoNotarialColumn = columnsData.find(column => column.id === 'n_meros9');
        const descripcionColumn = columnsData.find(column => column.id === 'ubicaci_n');
        const rutReceptorColumn = columnsData.find(column => column.id === 'texto97');

        // Calcular montos y totales
        const valorArriendo = parseFloat(valorArriendoColumn.text);
        const comisionRate = parseFloat(comisionRateColumn.text) / 100;
        const gastoNotarial = parseFloat(gastoNotarialColumn.text);

        // Calculos
        const comisionArriendo = valorArriendo * comisionRate;
        const subtotal = comisionArriendo + gastoNotarial;
        const iva = subtotal * 0.19; // Ajustar según corresponda
        const totalFactura = subtotal + iva

        // Generar una Idempotency Key única
        const idempotencyKey = generateIdempotencyKey();

        const emisor = {
            RUTEmisor: "76795561-8",
            RznSoc: "HAULMER SPA",
            GiroEmis: "VENTA AL POR MENOR EN EMPRESAS DE VENTA A DISTANCIA VÍA INTERNET; COMERCIO ELEC",
            Acteco: 479100,
            DirOrigen: "ARTURO PRAT 527   CURICO",
            CmnaOrigen: "Curicó",
            CdgSIISucur: "81303347"
        };

        const receptor = {
            RUTRecep: "76430498-5",
            RznSocRecep: "HOSTY SPA",
            GiroRecep: "ACTIVIDADES DE CONSULTORIA DE INFORMATIC",
            DirRecep: "ARTURO PRAT 527 3 pis OF 1",
            CmnaRecep: "Curicó"
        };

        // Configurar datos para la solicitud de factura a Openfactura
        const facturaData = {
            response: ["PDF", "FOLIO"],
            dte: {
                Encabezado: {
                    IdDoc: {
                        TipoDTE: 33,
                        Folio: 0,
                        FchEmis: new Date().toISOString().split('T')[0]
                    },
                    Emisor: emisor,
                    Receptor: receptor,
                    Totales: {
                        MntNeto: subtotal,
                        TasaIVA: "19",
                        IVA: iva,
                        MntTotal: totalFactura,
                    }
                },
                Detalle: [
                  {
                    NroLinDet: 1,
                    NmbItem: "Comision de Arriendo",
                    QtyItem: 1,
                    PrcItem: parseFloat(comisionArriendo),
                    MontoItem: comisionArriendo                   
                  },
                  {
                    NroLinDet: 2,
                    NmbItem: "Gasto Notarial",
                    QtyItem: 1,
                    PrcItem: parseFloat(gastoNotarial),
                    MontoItem: gastoNotarial                
                  }
                ],
                /*
                DscRcgGlobal: {
                  NroLinDR: 1, // Puedes ajustar este valor
                  TpoMov: "D", // Puedes ajustar este valor
                  TpoValor: "%", // Puedes ajustar este valor
                  ValorDR: 0, // Puedes ajustar este valor
                },
                */
            },
        };

        // Configuración de la solicitud
        var config = {
            method: 'post',
            url: 'https://dev-api.haulmer.com/v2/dte/document',
            headers: {
                'apikey': '928e15a2d14d4a6292345f04960f4bd3',
                'Idempotency-Key': idempotencyKey,
                'content-type': 'application/json'
            },
            data: facturaData
        };

        console.log("Antes de la solicitud a Openfactura");

        // Realizar la petición a Openfactura
        const facturaResponse = await axios(config);

        console.log("Respuesta de Openfactura:", facturaResponse.data);

        if (facturaResponse.data && facturaResponse.data.PDF && facturaResponse.data.FOLIO) {
            // Actualizar Monday.com con el PDF y otros datos
            const updateResponse = await axios.post('https://api.monday.com/v2', {
                query: `
                    mutation {
                        change_column_value (board_id: 5598495616, item_id: ${itemId}, column_id: "archivo9", value: "${facturaResponse.data.PDF}") {
                            id
                        }
                        // Otros cambios de columna según sea necesario
                    }
                `,
                headers: {
                  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjIzMjg3MzUyNCwiYWFpIjoxMSwidWlkIjoyMzUzNzM2NCwiaWFkIjoiMjAyMy0wMS0zMVQyMTowMjoxNy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6OTUwNzUxNiwicmduIjoidXNlMSJ9.lX1RYu90B2JcH0QxITaF8ymd4d6dBes0FJHPI1mzSRE',
                  'Content-Type': 'application/json'                }
            });

            console.log("Respuesta de la actualización en Monday.com:", updateResponse.data);

            if (updateResponse.data) {
                res.status(200).send("Factura creada y datos actualizados en Monday.com");
            } else {
                res.status(500).send("Error al actualizar Monday.com");
            }
        } else {
            throw new Error('La respuesta de Openfactura no contiene los campos esperados');
        }
    } catch (error) {
        if (error.response && error.response.data && error.response.data.error) {
            const { message, code, details } = error.response.data.error;
            console.error(`Error en Openfactura: ${message} (Código: ${code})`);
            details.forEach(detail => {
                console.error(`Campo: ${detail.field}, Problema: ${detail.issue}`);
            });
        } else {
            console.error('Error general:', error.message);
        }
        res.status(500).send('Error en la ejecución de la función');
    }
};