
// some useless non-workign code from AI

function prettyJson(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        console.error('Element not found for selector:', selector);
        return;
    }

    let jsonData;
    try {
        jsonData = JSON.parse(element.textContent);
    } catch (e) {
        console.error('Invalid JSON:', e);
        return;
    }

    function createCollapsibleSection(json) {
        const container = document.createElement('div');

        for (const key in json) {
            const keySpan = document.createElement('span');
            keySpan.textContent = key + ': ';
            keySpan.className = 'collapsible';

            const valueDiv = document.createElement('div');
            valueDiv.className = 'json-value';
            
            if (typeof json[key] === 'object') {
                valueDiv.appendChild(createCollapsibleSection(json[key]));
            } else {
                valueDiv.textContent = JSON.stringify(json[key]);
            }

            keySpan.onclick = function () {
                valueDiv.classList.toggle('collapsed');
            };

            const keyDiv = document.createElement('div');
            keyDiv.appendChild(keySpan);
            keyDiv.appendChild(valueDiv);

            container.appendChild(keyDiv);
        }

        return container;
    }

    const formattedJsonDiv = createCollapsibleSection(jsonData);
    element.textContent = '';
    element.appendChild(formattedJsonDiv);
}

// Usage example:
// prettyJson('#json-container'); // Replace '#json-container' with your selector
