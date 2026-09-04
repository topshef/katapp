

//probably wont get used.. just extracting from labs2026.js to cleanup



//untested placeholder .. for use with eg MOBOT treasure hunt releases
//see also kfund kpayuk and kpos
function unpack_KWT_to_JWT(kwt) {
    // Split the KWT into components
    const [dealIdSnippet, parameters, signature] = kwt.split('~')
    // parameters is usually just serial, but can be eg a comma-delimited list
    // serial could be an amount or any other parameter data
    // see also other versions of this function eg on kfund

    // Reconstruct the JWT header and payload
    const header = {
        alg: 'EdDSA',
        typ: 'JWT'
    }

    //if (dealIdSnippet.length != 64)
        //const dealId = ....dealIdSnippet // todo lookup full deal async if not supplied here
    //else 
        const dealId = dealIdSnippet
    
    const payload = {
        sub: `${dealId}.${parameters}` // sub contains the full deal ID and parameters (eg serial)
    }

    // Base64Url encode the header and payload
    const base64UrlHeader = btoa(JSON.stringify(header))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    
    const base64UrlPayload = btoa(JSON.stringify(payload))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

    // The signature is already Base64Url encoded, so use it directly
    const base64UrlSignature = signature

    // Reconstruct the JWT
    const jwt = `${base64UrlHeader}.${base64UrlPayload}.${base64UrlSignature}`

    return jwt
}