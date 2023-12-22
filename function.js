const axios = require('axios');
const { Storage } = require('@google-cloud/storage');
const FormData = require('form-data');

// Inicializa el cliente de Google Cloud Storage
const storage = new Storage();

// Función para generar una Idempotency Key única
function generateIdempotencyKey() {
  return Math.random().toString(36).substr(2, 9);
}

exports.generarFactura = async (req, res) => {
  try {
    console.log("Inicio de la función");

    if (!req.body || !req.body.event || !req.body.event.pulseId) {
      throw new Error('La solicitud no contiene la estructura esperada de un evento de Monday.com');
    }

    const itemId = req.body.event.pulseId;
    const apiKeyMonday = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjIzMjg3MzUyNCwiYWFpIjoxMSwidWlkIjoyMzUzNzM2NCwiaWFkIjoiMjAyMy0wMS0zMVQyMTowMjoxNy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6OTUwNzUxNiwicmduIjoidXNlMSJ9.lX1RYu90B2JcH0QxITaF8ymd4d6dBes0FJHPI1mzSRE'; // Reemplaza con tu API key de Monday.com
    const apiKeyHaulmer = '43b21e8886cd4866bfa8b40e6fd0b751'; // Reemplaza con tu API key de Haulmer
    const apiKeyOpenfactura = '41eb78998d444dbaa4922c410ef14057'; // Reemplaza con tu API key de Openfactura
    const bucketName = 'facturas-urbex'; // Nombre de tu bucket de Google Cloud Storage

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
        'Authorization': apiKeyMonday,
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
    const unidadColumn = columnsData.find(column => column.id === 'texto9');
    const rutReceptorColumn = columnsData.find(column => column.id === 'texto97');

    // Calcular montos y totales
    const valorArriendo = parseFloat(valorArriendoColumn.text);
    const comisionRate = parseFloat(comisionRateColumn.text) / 100;
    const gastoNotarial = parseFloat(gastoNotarialColumn.text);

    // Calculos
    const comisionArriendo = valorArriendo * comisionRate;
    const subtotal = comisionArriendo + gastoNotarial;
    const iva = subtotal * 0.19; // Ajustar según corresponda
    const totalFactura = subtotal + iva;

    // Generar una Idempotency Key única
    const idempotencyKey = generateIdempotencyKey();
    
    // Obtener información del emisor desde la API de Haulmer
    const rutEmisor = "76430498-5"; // RUT fijo del emisor
    console.log("RUT del emisor:", rutEmisor);
    
    let emisor;
    
    try {
        const haulmerResponse = await axios.get(`https://api.haulmer.com/v2/dte/taxpayer/${rutEmisor}`, {
          headers: {
            apikey: apiKeyHaulmer
          }
        });
      
        const dataEmisor = haulmerResponse.data;
        console.log("Datos del receptor recibidos de Haulmer:", dataEmisor);

        const giroEmisTruncado = dataEmisor.actividades.find(act => act.actividadPrincipal)?.giro.substring(0, 40) || '';
      
        emisor = {
          RUTEmisor: rutEmisor,
          RznSoc: dataEmisor.razonSocial || '',
          GiroEmis: giroEmisTruncado,
          Acteco: Number(dataEmisor.actividades.find(act => act.actividadPrincipal)?.codigoActividadEconomica) || 0,
          DirOrigen: dataEmisor.direccion || '',
          CmnaOrigen: dataEmisor.comuna || '',
          CdgSIISucur: dataEmisor.sucursales?.[0]?.cdgSIISucur || ''
        };
    
    } catch (error) {
      console.error('Error al obtener datos del emisor desde Haulmer:', error);
      // Manejo adicional del error si es necesario
    }


    // Obtener información del receptor desde la API de Haulmer
    const rutReceptor = rutReceptorColumn.text;
    console.log("RUT del receptor:", rutReceptor);
    let receptor;
    let razonSocialReceptor; // Declarada aquí para tener un ámbito más amplio

    try {
      const haulmerResponse = await axios.get(`https://api.haulmer.com/v2/dte/taxpayer/${rutReceptor}`, {
        headers: {
          apikey: apiKeyHaulmer
        }
      });
    
      const dataReceptor = haulmerResponse.data;
      console.log("Datos del receptor recibidos de Haulmer:", dataReceptor);
      razonSocialReceptor = dataReceptor.razonSocial || ''; // Asignación de valor
      console.log("Razón social del receptor:", razonSocialReceptor);
    
        // Obtener la actividad principal o una alternativa
        const actividadPrincipal = dataReceptor.actividades.find(act => act.actividadPrincipal);
        const actividadAlternativa = dataReceptor.actividades.length > 0 ? dataReceptor.actividades[0] : null;
        const actividadElegida = actividadPrincipal || actividadAlternativa;

        // Truncar el giro a 40 caracteres o usar "OTROS" si no hay giro
        const giroTruncado = actividadElegida && actividadElegida.giro ? actividadElegida.giro.substring(0, 40) : 'OTROS';

        receptor = {
        RUTRecep: dataReceptor.rut || '',
        RznSocRecep: dataReceptor.razonSocial || '',
        GiroRecep: giroTruncado,
        DirRecep: dataReceptor.direccion || '',
        CmnaRecep: dataReceptor.comuna || ''
        };
    
    } catch (error) {
      console.error('Error al obtener datos del receptor desde Haulmer:', error);
      // Considera agregar más lógica de manejo de errores aquí
    }

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
            NmbItem: "Comisión de Arriendo - OT Nº " + itemId,
            DscItem: descripcionColumn.text + " , Nº Unidad: " + unidadColumn.text,
            QtyItem: 1,
            PrcItem: parseFloat(comisionArriendo),
            MontoItem: comisionArriendo                   
          },
          {
            NroLinDet: 2,
            NmbItem: "Gasto Notarial - OT Nº " + itemId,
            DscItem: descripcionColumn.text + " , Nº Unidad: " + unidadColumn.text,
            QtyItem: 1,
            PrcItem: parseFloat(gastoNotarial),
            MontoItem: gastoNotarial                
          }
        ],
      },
    };

    // Configuración de la solicitud
    var config = {
      method: 'post',
      url: 'https://dev-api.haulmer.com/v2/dte/document',
      headers: {
        'apikey': apiKeyOpenfactura, // Reemplaza con tu API key de Openfactura
        'Idempotency-Key': generateIdempotencyKey(),
        'content-type': 'application/json'
      },
      data: facturaData
    };

    console.log("Antes de la solicitud a Openfactura");

    // Realizar la petición a Openfactura
    const facturaResponse = await axios(config);

    console.log("Respuesta de Openfactura:", facturaResponse.data);

    if (facturaResponse.data && facturaResponse.data.PDF && facturaResponse.data.FOLIO) {
      // Subir el archivo PDF a Google Cloud Storage
      const pdfFileName = `factura-${facturaResponse.data.FOLIO}.pdf`;
      const pdfBase64 = facturaResponse.data.PDF;

      const bucket = storage.bucket(bucketName);
      const file = bucket.file(pdfFileName);

      // Convierte la cadena Base64 a un Buffer
      const buffer = Buffer.from(pdfBase64, 'base64');

      const stream = file.createWriteStream({
        metadata: {
          contentType: 'application/pdf',
        },
      });

      const folio = parseInt(facturaResponse.data.FOLIO);
      console.log(folio);

      // Sube el archivo al bucket de GCS
      stream.end(buffer);

      stream.on('finish', async () => {
        console.log(`El archivo PDF se ha subido con éxito a GCS: ${pdfFileName}`);
        
        // Obtener la URL pública del archivo cargado en Google Cloud Storage
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${pdfFileName}`;

        // Subir el archivo a la columna de archivos en Monday.com
        try {
          const form = new FormData();
          form.append('query', `mutation add_file($file: File!) {
            add_file_to_column (item_id: ${itemId}, column_id: "archivo9", file: $file) {
              id
            }
          }`);
          form.append('variables[file]', buffer, {
            filename: pdfFileName,
            contentType: 'application/pdf', // Tipo de contenido correcto para un archivo PDF
          });

          const formDataHeaders = {
            ...form.getHeaders(),
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjIzMjg3MzUyNCwiYWFpIjoxMSwidWlkIjoyMzUzNzM2NCwiaWFkIjoiMjAyMy0wMS0zMVQyMTowMjoxNy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6OTUwNzUxNiwicmduIjoidXNlMSJ9.lX1RYu90B2JcH0QxITaF8ymd4d6dBes0FJHPI1mzSRE', // Reemplaza con tu API key de Monday.com
        };

          const uploadResponse = await axios.post('https://api.monday.com/v2', form, {
            headers: formDataHeaders,
          });

          console.log('Archivo subido a Monday.com:', uploadResponse.data);
          
          const updateResponse1 = await axios.post(
            'https://api.monday.com/v2',
            {
              query: `
                mutation {
                  change_simple_column_value (item_id: ${itemId}, board_id: 5598495616, column_id:"texto46", value: "${folio}") {
                    id
                  }
                }
              `,
            },
            {
              headers: {
                'Authorization': apiKeyMonday,
                'Content-Type': 'application/json'
              },
            }
          );

          const updateResponse2 = await axios.post(
            'https://api.monday.com/v2',
            {
              query: `
                mutation {
                  change_simple_column_value (item_id: ${itemId}, board_id: 5598495616, column_id:"enlace9", value: "${publicUrl} Ver Factura") {
                    id
                  }     
                }
              `,
            },
            {
              headers: {
                'Authorization': apiKeyMonday,
                'Content-Type': 'application/json'
              },
            }
          );

          const updateResponse3 = await axios.post(
            'https://api.monday.com/v2',
            {
              query: `
                mutation {
                  change_simple_column_value (item_id: ${itemId}, board_id: 5598495616, column_id:"texto92", value: "${razonSocialReceptor}" ) {
                    id
                  }     
                }
              `,
            },
            {
              headers: {
                'Authorization': apiKeyMonday,
                'Content-Type': 'application/json'
              },
            }
          );

          console.log("Respuesta de la actualización en Monday.com:", updateResponse1.data);
          console.log("Respuesta de la actualización en Monday.com:", updateResponse2.data);
          console.log("Respuesta de la actualización en Monday.com:", updateResponse3.data);

          if (updateResponse1.data && updateResponse2.data) {
            res.status(200).send("Factura creada y datos actualizados en Monday.com");
          } else {
            res.status(500).send("Error al actualizar Monday.com");
          }
        } catch (mondayError) {
          console.error('Error al actualizar Monday.com:', mondayError);
          res.status(500).send('Error al actualizar Monday.com');
        }
      });

      stream.on('error', (err) => {
        console.error('Error al subir el archivo a GCS:', err);
        res.status(500).send('Error al subir el archivo a GCS');
      });
    } else {
      throw new Error('La respuesta de Openfactura no contiene los campos esperados');
    }
  } catch (error) {
    console.error('Error general:', error.message);
    if (error.response) {
      console.error('Respuesta de error de Openfactura:', error.response.data);
    }
    res.status(500).send('Error en la ejecución de la función');
  }
};