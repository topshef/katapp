
//cache IPFS data in indexedDB using localbase

// Encapsulate in window.IPFS_cache
window.IPFS_cache = (() => {
    // Initialize LocalBase
    let dbIPFS = new Localbase('IPFS_cache')

    // IPFS Gateway URLs to try
    const gateways = [
        'https://ipfs.io/ipfs/',
        'https://dweb.link/ipfs/',
        'https://gateway.pinata.cloud/ipfs/'
    ]

    // Fetch data from IPFS using multiple gateways
    async function fetchFromIPFS(cid, responseType = 'text') {
        let contentPath = cid.replace(/^ipfs:\/\//, ''); // Remove 'ipfs://' prefix
        let shuffledGateways = gateways.sort(() => Math.random() - 0.5); // Randomize gateway order
        for (let gateway of shuffledGateways) {
            try {
                let response = await fetch(gateway + contentPath, { mode: 'cors' }); // Enable CORS mode
                if (response.ok) {
                    console.log('Live fetch from IPFS', cid);
                    return responseType === 'blob' ? await response.blob() : await response.text();
                }
            } catch (error) {
                console.warn(`Failed to fetch from ${gateway}:`, error);
            }
        }
        throw new Error('All IPFS gateways failed');
    }


    // Cache handling function
    async function cacheData(key, data) {
        await dbIPFS.collection('cache').add({ key, data, timestamp: Date.now() })
    }

    // Get data from IPFS, with caching
    async function getDataIPFS(key, responseType = 'text') {
        let cached = await dbIPFS.collection('cache').doc({ key }).get()
        if (cached && (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000)) {
            console.log(`Using cached data for ${key}`)
            return cached.data
        } else {
            let data = await fetchFromIPFS(key, responseType)
            await cacheData(key, data)
            return data
        }
    }

    // Convert a Blob to a Base64 string
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            if (!(blob instanceof Blob)) {
                reject(new TypeError('Provided input is not a Blob.'));
                return;
            }
            let reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]); // Get the Base64 part
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }


    // Generate a thumbnail using <canvas>
    function createThumbnail(imgSrc, maxWidth = 200) {
        return new Promise((resolve) => {
            let img = new Image()
            img.crossOrigin = 'Anonymous' // Allow cross-origin image loading
            img.onload = () => {
                let canvas = document.createElement('canvas')
                let scale = maxWidth / img.width
                canvas.width = maxWidth
                canvas.height = img.height * scale
                let ctx = canvas.getContext('2d')
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                resolve(canvas.toDataURL()) // Return the data URL for the thumbnail
            }
            img.src = imgSrc
        })
    }

    // Process metadata from IPFS and return image data
    async function processMetadataFromIPFS(ipfsAddress) {
        try {
            let metadata = await getDataIPFS(ipfsAddress);
            let jsonData = JSON.parse(metadata);

            // Extract the image URL (CID) from the JSON data
            let imageCid = jsonData.image;
            if (!imageCid) {
                console.error('No image found in JSON metadata:', jsonData);
                return null;
            }

            // Check if the image is cached or needs to be fetched
            let imageKey = `ipfs://${imageCid.replace(/^ipfs:\/\//, '')}`;
            let imageBlob = await getDataIPFS(imageKey, 'blob');

            // Ensure that the fetched data is a Blob before proceeding
            if (!(imageBlob instanceof Blob)) {
                console.error('Fetched data is not a Blob:', imageBlob);
                return null;
            }

            // Convert the Blob to a Base64 string
            let base64Image = await blobToBase64(imageBlob);
            let imgSrc = `data:image/jpeg;base64,${base64Image}`; // Use data:image/png;base64 if the format is PNG

            // Generate a thumbnail
            let thumbnail = await createThumbnail(imgSrc);
            return { imgSrc, thumbnail };
        } catch (error) {
            console.error('Error processing metadata from IPFS:', error);
            return null;
        }
    }

    // Publicly expose the functions
    return {
        fetchFromIPFS,
        getDataIPFS,
        processMetadataFromIPFS,
        createThumbnail
    }
})()
