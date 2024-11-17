// Encapsulate in window.Arweave_cache
window.Arweave_cache = (() => {
    // Initialize LocalBase
    let dbArweave = new Localbase('Arweave_cache');

    // Arweave Gateway URLs to try
    const gateways = [
        'https://arweave.net/',
        // 'https://arweave.live/',
        'https://arweave.dev/',
        // 'https://arweave.co/',
    ];

    // Fetch data from Arweave using multiple gateways
    async function fetchFromArweave(txid, responseType = 'text') {
        let contentPath = txid.replace(/^ar:\/\//, ''); // Remove 'ar://' prefix

        console.log(`TXID = ${contentPath}`);
        // Validate Arweave TXID (43-character Base64 URL-encoded string)
        if (!/^[a-zA-Z0-9_-]{43}$/.test(contentPath)) {
            console.error(`Invalid format for Arweave TXID: ${contentPath}`);
            return false;
        }

        let shuffledGateways = gateways.sort(() => Math.random() - 0.5); // Randomize gateway order
        for (let gateway of shuffledGateways) {
            try {
                let response = await fetch(gateway + contentPath, { mode: 'cors' }); // Enable CORS mode
                if (response.ok) {
                    console.log('Live fetch from Arweave:', txid);
                    return responseType === 'blob' ? await response.blob() : await response.text();
                }
            } catch (error) {
                console.warn(`Failed to fetch from ${gateway}:`, error);
            }
        }
        throw new Error('All Arweave gateways failed');
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

    // Convert a Base64 string back to a Blob
    function base64ToBlob(base64Data, contentType = 'application/octet-stream') {
        const byteCharacters = atob(base64Data);
        const byteArrays = [];
        const sliceSize = 1024;

        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            const slice = byteCharacters.slice(offset, offset + sliceSize);
            const byteNumbers = new Array(slice.length);

            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }

            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }

        return new Blob(byteArrays, { type: contentType });
    }

    // Cache handling function
    async function cacheData(key, data, responseType = 'text') {
        const storedData = responseType === 'blob' ? await blobToBase64(data) : data;
        await dbArweave.collection('cache').doc(key).set({
            data: storedData,
            isBlob: responseType === 'blob',
            timestamp: Date.now(),
        });
    }

    // Get data from Arweave, with caching
    async function getDataArweave(key, responseType = 'text') {
        let cached = await dbArweave.collection('cache').doc(key).get();
        if (cached && cached.data) {
            console.log(`Using cached data for ${key}`);
            if (responseType === 'blob' && cached.isBlob) {
                // Convert Base64 string back to Blob
                return base64ToBlob(cached.data, 'image/jpeg'); // Adjust MIME type if necessary
            } else {
                return cached.data;
            }
        } else {
            let data = await fetchFromArweave(key, responseType);
            if (!data) return false;
            await cacheData(key, data, responseType);
            return data;
        }
    }

    // Generate a thumbnail using <canvas>
    function createThumbnail(imgSrc, maxWidth = 200) {
        return new Promise((resolve) => {
            let img = new Image();
            img.crossOrigin = 'Anonymous'; // Allow cross-origin image loading
            img.onload = () => {
                let canvas = document.createElement('canvas');
                let scale = maxWidth / img.width;
                canvas.width = maxWidth;
                canvas.height = img.height * scale;
                let ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL()); // Return the data URL for the thumbnail
            };
            img.src = imgSrc;
        });
    }

    // Process metadata from Arweave and return image data
    async function processMetadataFromArweave(arweaveAddress) {
        try {
            // Remove 'ar://' prefix if present
            let txid = arweaveAddress.replace(/^ar:\/\//, '');
            let metadata = await getDataArweave(txid); // Fetch metadata as text
            let jsonData = JSON.parse(metadata);

            // Extract the image TXID from the JSON data
            let imageTxid = jsonData.image;
            if (!imageTxid) {
                console.error('No image found in JSON metadata:', jsonData);
                return null;
            }

            // Remove 'ar://' prefix if present
            imageTxid = imageTxid.replace(/^ar:\/\//, '');

            // Fetch the image as a Blob
            let imageBlob = await getDataArweave(imageTxid, 'blob');

            // Ensure that the fetched data is a Blob before proceeding
            if (!(imageBlob instanceof Blob)) {
                console.error('Fetched data is not a Blob:', imageBlob);
                return null;
            }

            // Convert the Blob to a Base64 string
            let base64Image = await blobToBase64(imageBlob);
            let imgSrc = `data:image/jpeg;base64,${base64Image}`; // Adjust MIME type if necessary

            // Generate a thumbnail
            let thumbnail = await createThumbnail(imgSrc);
            return { arweaveAddress, imgSrc, thumbnail };
        } catch (error) {
            console.error('Error processing metadata from Arweave:', error);
            return null;
        }
    }

    // Publicly expose the functions
    return {
        fetchFromArweave,
        getDataArweave,
        processMetadataFromArweave,
        createThumbnail,
    };
})();
