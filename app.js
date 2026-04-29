// Main application functionality
document.addEventListener('DOMContentLoaded', function() {
    // UI Elements
    const searchButton = document.getElementById('search-button');
    const centerButton = document.getElementById('center-button');
    const ancestryButton = document.getElementById('ancestry-button');
    
    const searchDialog = document.getElementById('search-dialog');
    const ancestryDialog = document.getElementById('ancestry-dialog');
    
    const closeDialog = document.getElementById('close-dialog');
    const closeAncestryDialog = document.getElementById('close-ancestry-dialog');
    
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    
    const person1Input = document.getElementById('person1-input');
    const person2Input = document.getElementById('person2-input');
    const person1Results = document.getElementById('person1-results');
    const person2Results = document.getElementById('person2-results');
    
    const selectedPerson1 = document.getElementById('selected-person1');
    const selectedPerson2 = document.getElementById('selected-person2');
    
    const findAncestorBtn = document.getElementById('find-ancestor-btn');
    
    // Track selected people for ancestry search
    let selectedPerson1Node = null;
    let selectedPerson2Node = null;
    
    // Track if we're in ancestry view mode
    let isAncestryViewActive = false;
    
    // Open search dialog
    searchButton.addEventListener('click', function() {
        searchDialog.classList.add('active');
        searchInput.focus();
        searchInput.value = '';
        searchResults.innerHTML = '';
    });
    
    // Close search dialog
    closeDialog.addEventListener('click', function() {
        searchDialog.classList.remove('active');
    });
    
    // Close dialog when clicking outside
    searchDialog.addEventListener('click', function(e) {
        if (e.target === searchDialog) {
            searchDialog.classList.remove('active');
        }
    });
    
    // Center view functionality
    centerButton.addEventListener('click', function() {
        if (isAncestryViewActive) {
            // If in ancestry view, center on the common ancestor
            window.centerOnAncestryRoot();
        } else {
            // If in normal view, just center
            resetView();
            showStatusMessage('Wyśrodkowano');
        }
    });
    
    // Open ancestry dialog
    ancestryButton.addEventListener('click', function() {
        if (isAncestryViewActive) {
            // If button says "Go back", restore full view
            restoreFullView();
        } else {
            // Open ancestry search dialog
            ancestryDialog.classList.add('active');
            resetAncestrySearch();
        }
    });
    
    // Close ancestry dialog
    closeAncestryDialog.addEventListener('click', function() {
        ancestryDialog.classList.remove('active');
    });
    
    // Close ancestry dialog when clicking outside
    ancestryDialog.addEventListener('click', function(e) {
        if (e.target === ancestryDialog) {
            ancestryDialog.classList.remove('active');
        }
    });
    
    // Handle search input for regular search
    searchInput.addEventListener('input', function() {
        const query = this.value.toLowerCase();
        searchResults.innerHTML = '';
        
        if (query.length < 2) return;
        
        // Find matches in the node data
        showSearchResults(query, searchResults, function(node) {
            focusOnNode(node);
            searchDialog.classList.remove('active');
        });
    });
    
    // Handle search input for Person 1
    person1Input.addEventListener('input', function() {
        const query = this.value.toLowerCase();
        person1Results.innerHTML = '';
        
        if (query.length < 2) return;
        
        // Find matches for person 1
        showSearchResults(query, person1Results, function(node) {
            selectPerson(1, node);
        });
    });
    
    // Handle search input for Person 2
    person2Input.addEventListener('input', function() {
        const query = this.value.toLowerCase();
        person2Results.innerHTML = '';
        
        if (query.length < 2) return;
        
        // Find matches for person 2
        showSearchResults(query, person2Results, function(node) {
            selectPerson(2, node);
        });
    });
    
    // Clear selection for Person 1
    selectedPerson1.querySelector('.clear-selection').addEventListener('click', function() {
        clearPersonSelection(1);
        updateFindButtonState();
    });
    
    // Clear selection for Person 2
    selectedPerson2.querySelector('.clear-selection').addEventListener('click', function() {
        clearPersonSelection(2);
        updateFindButtonState();
    });
    
    // Find common ancestor button
    findAncestorBtn.addEventListener('click', function() {
        if (selectedPerson1Node && selectedPerson2Node) {
            // Call the visualization's ancestry function
            const result = window.findAncestry(selectedPerson1Node, selectedPerson2Node);
            
            if (result.commonAncestor) {
                // Common ancestor exists - close the dialog
                ancestryDialog.classList.remove('active');
                
                // Enable ancestry view mode
                isAncestryViewActive = true;
                ancestryButton.textContent = 'Powrót';
                
                // Check if it's a direct ancestry relationship
                if (result.directAncestry) {
                    if (result.commonAncestor === selectedPerson1Node) {
                        showStatusMessage(`${selectedPerson1Node.data.name} ${selectedPerson1Node.data.lastName} is an ancestor of ${selectedPerson2Node.data.name} ${selectedPerson2Node.data.lastName}`);
                    } else {
                        showStatusMessage(`${selectedPerson2Node.data.name} ${selectedPerson2Node.data.lastName} is an ancestor of ${selectedPerson1Node.data.name} ${selectedPerson1Node.data.lastName}`);
                    }
                } else {
                    // Regular common ancestor
                    showStatusMessage(`Found: ${result.commonAncestor.data.name} ${result.commonAncestor.data.lastName}`);
                }
                
                // NEW: Automatically center on the common ancestor
                setTimeout(() => {
                    window.centerOnAncestryRoot();
                }, 500);
            } else {
                // No common ancestor - show message in the dialog
                // Create or show the error message
                let errorMsg = document.getElementById('ancestry-error');
                
                if (!errorMsg) {
                    errorMsg = document.createElement('div');
                    errorMsg.id = 'ancestry-error';
                    errorMsg.style.backgroundColor = '#ffebee';
                    errorMsg.style.color = '#c62828';
                    errorMsg.style.padding = '10px 15px';
                    errorMsg.style.borderRadius = '4px';
                    errorMsg.style.marginBottom = '15px';
                    errorMsg.style.marginTop = '15px';
                    errorMsg.style.fontWeight = 'bold';
                    errorMsg.style.textAlign = 'center';
                    
                    // Insert before the find button
                    const findBtn = document.getElementById('find-ancestor-btn');
                    findBtn.parentNode.insertBefore(errorMsg, findBtn);
                }
                
                errorMsg.textContent = 'Brak wspólnego przodka';
                errorMsg.style.display = 'block';
            }
        }
    });
    
    // Add keyboard shortcut: ESC to close dialogs
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (searchDialog.classList.contains('active')) {
                searchDialog.classList.remove('active');
            }
            if (ancestryDialog.classList.contains('active')) {
                ancestryDialog.classList.remove('active');
            }
        }
    });
    
    // Helper function to show search results
    function showSearchResults(query, resultsContainer, onSelectCallback) {
        // If window.nodeMap exists (created by the visualization)
        if (window.nodeMap) {
            const matches = [];
            
            // MODIFIED: When in ancestry view, only show visible nodes in search
            if (isAncestryViewActive && window.getVisibleNodes) {
                const visibleNodes = window.getVisibleNodes();
                for (const fullName in window.nodeMap) {
                    const node = window.nodeMap[fullName];
                    if (fullName.toLowerCase().includes(query) && visibleNodes.has(node)) {
                        matches.push({ name: fullName, node: node });
                    }
                }
            } else {
                // Regular search (all nodes)
                for (const fullName in window.nodeMap) {
                    if (fullName.toLowerCase().includes(query)) {
                        matches.push({ name: fullName, node: window.nodeMap[fullName] });
                    }
                }
            }
            
            // Display matches
            if (matches.length > 0) {
                matches.forEach(match => {
                    const item = document.createElement('div');
                    item.className = 'search-item';
                    item.textContent = match.name;
                    item.addEventListener('click', () => {
                        onSelectCallback(match.node);
                    });
                    resultsContainer.appendChild(item);
                });
            } else {
                const noResults = document.createElement('div');
                noResults.textContent = 'No matches found';
                noResults.style.padding = '10px';
                noResults.style.color = '#666';
                resultsContainer.appendChild(noResults);
            }
        }
    }
    
    // Select a person for ancestry search
    function selectPerson(personNum, node) {
        const container = personNum === 1 ? selectedPerson1 : selectedPerson2;
        const input = personNum === 1 ? person1Input : person2Input;
        const results = personNum === 1 ? person1Results : person2Results;
        
        // Store the selected node
        if (personNum === 1) {
            selectedPerson1Node = node;
        } else {
            selectedPerson2Node = node;
        }
        
        // Update UI
        container.querySelector('.person-name').textContent = `${node.data.name} ${node.data.lastName}`;
        container.classList.add('active');
        input.value = '';
        results.innerHTML = '';
        
        // Update find button state
        updateFindButtonState();
        
        // Clear any error message when changing selection
        hideAncestryError();
    }
    
    // Clear person selection
    function clearPersonSelection(personNum) {
        const container = personNum === 1 ? selectedPerson1 : selectedPerson2;
        
        // Clear stored node
        if (personNum === 1) {
            selectedPerson1Node = null;
        } else {
            selectedPerson2Node = null;
        }
        
        // Update UI
        container.classList.remove('active');
        
        // Clear any error message when changing selection
        hideAncestryError();
    }
    
    // Update the state of the Find Ancestor button
    function updateFindButtonState() {
        findAncestorBtn.disabled = !(selectedPerson1Node && selectedPerson2Node);
    }
    
    // Reset ancestry search form
    function resetAncestrySearch() {
        person1Input.value = '';
        person2Input.value = '';
        person1Results.innerHTML = '';
        person2Results.innerHTML = '';
        selectedPerson1.classList.remove('active');
        selectedPerson2.classList.remove('active');
        selectedPerson1Node = null;
        selectedPerson2Node = null;
        updateFindButtonState();
        
        // Clear any error message
        hideAncestryError();
    }
    
    // Helper to hide the ancestry error message
    function hideAncestryError() {
        const errorMsg = document.getElementById('ancestry-error');
        if (errorMsg) {
            errorMsg.style.display = 'none';
        }
    }
    
    // Show status message
    function showStatusMessage(message) {
        const statusMsg = document.getElementById('status-message');
        if (statusMsg) {
            statusMsg.textContent = message;
            statusMsg.style.opacity = 1;
            
            setTimeout(() => {
                statusMsg.style.opacity = 0;
            }, 2000);
        }
    }
    
    // Restore full view after ancestry view
    function restoreFullView() {
        // Reset the visualization to show all nodes
        window.restoreAllNodes();
        
        // Update UI state
        isAncestryViewActive = false;
        ancestryButton.textContent = 'Pokrewieństwo';
        
        // Center the view
        resetView();
        showStatusMessage('Widok na wszystkich');
    }
    
    // Enhance SVG for better dragging experience
    function setupDragCursors() {
        const svg = document.getElementById('family-tree-svg');
        if (svg) {
            svg.addEventListener('mousedown', function() {
                svg.classList.add('grabbing');
            });
            
            document.addEventListener('mouseup', function() {
                svg.classList.remove('grabbing');
            });
        }
    }
    
    // Setup drag cursors after a short delay to ensure SVG is created
    setTimeout(setupDragCursors, 1000);
});