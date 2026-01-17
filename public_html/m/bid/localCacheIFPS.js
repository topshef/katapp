// Encapsulate in window.IPFS_cache
window.IPFS_cache = (() => {
    // Initialize LocalBase
    let dbIPFS = new Localbase('IPFS_cache');

    // IPFS Gateway URLs to try
    const gateways = [

        'https://shop.gomint.me/m/ipfs/',
        //'https://gateway.pinata.cloud/ipfs/',
        // 'https://ipfs.eternum.io/ipfs/',
        //'https://nftstorage.link/ipfs/'
    ];

        // 'https://ipfs.io/ipfs/',
        // 'https://dweb.link/ipfs/',
        // 'https://ipfs.drink.cafe/ipfs/',
        // 'https://gateway.serph.network/ipfs/',        
        // 'https://ipfs.infura.io/ipfs/',
        // 'https://ipfs.fleek.co/ipfs/',
        // 'https://cloudflare-ipfs.com/ipfs/',

    // Fetch data from IPFS using multiple gateways
    async function fetchFromIPFS(cid, responseType = 'text') {
        let contentPath = cid.replace(/^ipfs:\/\//, ''); // Remove 'ipfs://' prefix
        
        // console.log(`CID = ${contentPath}`)
        // if (!/^[a-zA-Z0-9]{46}$/.test(contentPath)) {
            // console.log(`invalid format for CID ${contentPath}`)
            // return false
        // }

        let shuffledGateways = gateways.sort(() => Math.random() - 0.5); // Randomize gateway order
        for (let gateway of shuffledGateways) {
            try {
                //let response = await fetch(gateway + contentPath, { mode: 'cors' }); // Enable CORS mode
                let response = await fetch(gateway + contentPath)

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
        let storedData;
        if (responseType === 'blob') {
            // Convert Blob to Base64 string for storage
            storedData = await blobToBase64(data);
        } else {
            storedData = data;
        }
        await dbIPFS.collection('cache').doc(key).set({
            data: storedData,
            isBlob: responseType === 'blob',
            timestamp: Date.now(),
        });
    }

    // Get data from IPFS, with caching
    async function getDataIPFS(key, responseType = 'text') {
        let cached = await dbIPFS.collection('cache').doc(key).get();
        if (cached && cached.data) {
            console.log(`Using cached data for ${key}`);
            if (responseType === 'blob' && cached.isBlob) {
                // Convert Base64 string back to Blob
                let blob = base64ToBlob(cached.data, 'image/jpeg'); // Adjust MIME type if necessary
                return blob;
            } else {
                return cached.data;
            }
        } else {
            //todo support arweave eg
            //ar://PQ05X1SDqOznFhtSY0So6BjZb2HD_r1pIunC-CLq0DU
            //https://arweave.net/PQ05X1SDqOznFhtSY0So6BjZb2HD_r1pIunC-CLq0DU
            
            let data = await fetchFromIPFS(key, responseType)
            if (!data) return false
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

    // Process metadata from IPFS and return image data
    async function processMetadataFromIPFS(address) {
        try {
            
            // Remove 'ipfs://' prefix if present
            let cid = address.replace(/^ipfs:\/\//, '');
            let metadata = await getDataIPFS(cid); // Fetch metadata as text
            let jsonData = JSON.parse(metadata);

            // Extract the image URL (CID) from the JSON data
            let imageCid = jsonData.image;
            if (!imageCid) {
                console.error('No image found in JSON metadata:', jsonData);
                return null;
            }

            // Remove 'ipfs://' prefix if present
            imageCid = imageCid.replace(/^ipfs:\/\//, '');

            // Fetch the image as a Blob
            let imageBlob = await getDataIPFS(imageCid, 'blob');

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
            return { address, imgSrc, thumbnail }
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
        createThumbnail,
    };
})();
