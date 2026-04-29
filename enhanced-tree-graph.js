// Global fallback photo URL for missing or error images
const FALLBACK_PHOTO_URL = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";

// Global fallback node color for missing/invalid colors
const FALLBACK_NODE_COLOR = "#e0e0e0";

// Root node configuration
const ROOT_NODE = {
  name: "NZS",
  lastName: "OU UW",
  photo: "NZS_UW.jpg",
  color: "#374d9b",
  isRoot: true
};

function normalizeNodeColor(colorValue) {
  if (typeof colorValue !== "string") return FALLBACK_NODE_COLOR;
  const trimmed = colorValue.trim();
  if (!trimmed) return FALLBACK_NODE_COLOR;
  // Accept any valid CSS color: named colors, #RGB/#RRGGBB/#RRGGBBAA, rgb(), hsl(), etc.
  if (typeof CSS !== "undefined" && CSS.supports && CSS.supports("color", trimmed)) {
    return trimmed;
  }
  return FALLBACK_NODE_COLOR;
}

function isValidColorString(colorValue) {
  if (typeof colorValue !== "string") return false;
  const trimmed = colorValue.trim();
  if (!trimmed) return false;
  return typeof CSS !== "undefined" && CSS.supports && CSS.supports("color", trimmed);
}

function normalizePhotoUrl(photoValue) {
  if (typeof photoValue !== "string") return null;
  const trimmed = photoValue.trim();
  return trimmed ? trimmed : null;
}

// Global variables for diagram elements
let svgElement;
let zoomInstance;
let mainGroup;
let allNodes = [];
let simulation;
let allNodeGroups = []; // Store all node groups for hiding/showing
let originalRoot; // Store the original root node
let tempRoot = null; // For storing temporary ancestry root
let originalLinks = []; // Store original links for restoration

// Function to fetch and process data
async function fetchFamilyData() {
  try {
    // CSV URL from Google Sheets
    const csvUrl = "https://script.google.com/macros/s/AKfycbwpSRdqKScPj8i3sZuyiGDcO5zm_-ZwCiw4lrMu6l2c55e3Exc7COlQ-WFowpADiAIHVQ/exec";
    
    // Fetch the CSV data
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status}`);
    }
    
    const csvText = await response.text();
    
    // Process the CSV into hierarchical data
    return processCSVData(csvText);
  } catch (error) {
    console.error("Error fetching or processing data:", error);
    // Return example data as fallback
    return createExampleData();
  }
}

// Function to parse CSV and build hierarchical structure
function processCSVData(csvText) {
  // Parse CSV
  const rows = d3.csvParse(csvText);
  
  // Create nodes map with child info
  const nodesMap = new Map();
  
  // First pass: create all child nodes
  rows.forEach(row => {
    const childName = row.child_name?.replace(/"/g, '') || '';
    const childLastName = row.child_last_name?.replace(/"/g, '') || '';
    
    // Skip if no child name
    if (!childName || !childLastName) return;
    
    const childId = `${childName}-${childLastName}`;

    const childPhoto = normalizePhotoUrl((row.photo ?? "").toString().replace(/"/g, ""));
    const rawChildColor = (row.color ?? "").toString().replace(/"/g, "").trim();
    const childColor = rawChildColor ? rawChildColor : null;
    
    // Create child node if it doesn't exist; otherwise fill missing fields.
    if (!nodesMap.has(childId)) {
      nodesMap.set(childId, {
        name: childName,
        lastName: childLastName,
        photo: childPhoto,
        color: childColor,
        children: [],
        hasParent: false
      });
    } else {
      const existing = nodesMap.get(childId);
      if (!existing.photo && childPhoto) existing.photo = childPhoto;
      if (!existing.color && childColor) existing.color = childColor;
    }
  });
  
  // Second pass: create parent-child relationships
  rows.forEach(row => {
    const childName = row.child_name?.replace(/"/g, '') || '';
    const childLastName = row.child_last_name?.replace(/"/g, '') || '';
    const parentName = row.parent_name?.replace(/"/g, '') || '';
    const parentLastName = row.parent_last_name?.replace(/"/g, '') || '';
    
    // Skip if no child or parent name
    if (!childName || !childLastName) return;
    
    const childId = `${childName}-${childLastName}`;
    const childNode = nodesMap.get(childId);
    
    // If parent exists
    if (parentName && parentLastName) {
      const parentId = `${parentName}-${parentLastName}`;
      
      // Mark that this child has a parent
      childNode.hasParent = true;
      
      // Create parent node if it doesn't exist yet
      if (!nodesMap.has(parentId)) {
        nodesMap.set(parentId, {
          name: parentName,
          lastName: parentLastName,
          photo: null,
          color: null,
          children: [],
          hasParent: false
        });
      }
      
      // Add child to parent's children
      const parentNode = nodesMap.get(parentId);
      if (!parentNode.children.some(child => child.name === childName && child.lastName === childLastName)) {
        parentNode.children.push(childNode);
      }
    }
  });
  
  // Build the final tree structure with a central root
  const rootNode = { ...ROOT_NODE, children: [] };
  
  // Add all nodes without parents as children of the root
  nodesMap.forEach(node => {
    if (!node.hasParent) {
      rootNode.children.push(node);
    }
  });
  
  return rootNode;
}

// Function to create example data as fallback
function createExampleData() {
  const rootNode = { ...ROOT_NODE, children: [] };
  
  // Add example nodes if fetching real data fails
  rootNode.children = [
    {
      name: "Emma",
      lastName: "Johnson",
      photo: "https://randomuser.me/api/portraits/women/2.jpg",
      color: "hotpink",
      hasParent: false,
      children: [
        { 
          name: "Michael", 
          lastName: "Johnson",
          photo: null,
          color: "#1E90FF",
          hasParent: true 
        }
      ]
    },
    {
      name: "Robert",
      lastName: "Davis",
      photo: null,
      color: "seagreen",
      hasParent: false,
      children: []
    }
  ];
  
  return rootNode;
}

// Calculate stats for each node (number of children, ancestors, depth)
function calculateNodeStats(nodes) {
  // This function operates on the raw data tree (plain objects), not d3.hierarchy nodes.
  function countDescendants(nodeData) {
    const children = Array.isArray(nodeData?.children) ? nodeData.children : [];
    let count = children.length;
    for (const child of children) {
      count += countDescendants(child);
    }
    return count;
  }

  function processNode(nodeData, depth = 0, ancestors = []) {
    if (!nodeData) return;

    nodeData.ancestorsList = ancestors.map(a => `${a.name} ${a.lastName}`);
    nodeData.descendantsCount = countDescendants(nodeData);
    nodeData.depth = depth;

    const children = Array.isArray(nodeData.children) ? nodeData.children : [];
    for (const child of children) {
      processNode(child, depth + 1, [...ancestors, nodeData]);
    }
  }

  if (!nodes) return nodes;
  processNode(nodes);
  return nodes;
}

// Function to create the chart
async function createChart() {
  try {
    // Fetch data
    const data = await fetchFamilyData();
    
    // Calculate node stats
    calculateNodeStats(data);
    
    // Store original root for later
    originalRoot = data;
    
    // Get container dimensions
    const container = document.getElementById("chart-container");
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Node dimensions
    const nodeRadius = 30;
    const rootNodeRadius = 60; // Larger radius for root node
    const nameFontSize = 12;
    const rootNameFontSize = 16; // Larger font for root node
    const lastNameFontSize = 12;
    const rootLastNameFontSize = 16; // Larger font for root node last name
    const textPadding = 8; // Padding for text background boxes

    // Compute the graph and start the force simulation
    const root = d3.hierarchy(data);
    const links = root.links();
    const nodes = root.descendants();
    
    // Store all nodes for search functionality
    allNodes = nodes;
    
    // Store original links for restoration
    originalLinks = links.slice();

    // Store nodes in global lookup for search functionality
    window.nodeMap = {};
    nodes.forEach(node => {
      const fullName = `${node.data.name} ${node.data.lastName}`;
      window.nodeMap[fullName] = node;
    });

    // Create the force simulation with original parameters
    simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(0).strength(1))
        .force("charge", d3.forceManyBody().strength(d => d.data.isRoot ? -32000 : -4000)) // More repulsive force for root
        .force("x", d3.forceX())
        .force("y", d3.forceY())
        // Add collision detection to prevent overlap, with larger radius for root
        .force("collision", d3.forceCollide().radius(d => d.data.isRoot ? rootNodeRadius + 20 : nodeRadius + 10));

    // Implement initial positioning for better starting conditions
    function assignInitialPositions() {
      // First position all direct children of root
      const rootChildren = nodes.filter(d => d.parent && d.parent.data.isRoot);
      const angleStep = 2 * Math.PI / rootChildren.length;
      
      rootChildren.forEach((child, i) => {
        const angle = i * angleStep;
        const distance = 150;
        child.x = Math.cos(angle) * distance;
        child.y = Math.sin(angle) * distance;
        
        // Then position their children in the same general direction
        positionDescendants(child, angle, distance + 100);
      });
    }

    function positionDescendants(node, baseAngle, distance) {
      const children = nodes.filter(d => d.parent === node);
      const spread = 0.5; // How wide to spread children around the base angle
      
      children.forEach((child, i) => {
        const childSpread = children.length <= 1 ? 0 : 
          spread * (i / (children.length - 1) - 0.5);
        const angle = baseAngle + childSpread;
        
        child.x = Math.cos(angle) * distance;
        child.y = Math.sin(angle) * distance;
        
        // Recursively position this child's children
        positionDescendants(child, angle, distance + 80);
      });
    }

    // Call this before starting the simulation
    assignInitialPositions();
    simulation.alpha(0.3).restart(); // Lower alpha for less dramatic movement

    // Create the container SVG with responsive sizing
    const svg = d3.create("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", [-width/2, -height/2, width, height])
      .attr("id", "family-tree-svg");
    
    // Store reference to SVG
    svgElement = svg;
    
    // Define arrow markers for the links
    svg.append("defs").append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 32) // Position the arrow away from the node
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#999");
    
    // Add zoom functionality with cursor change
    mainGroup = svg.append("g")
      .attr("id", "main-group");
    
    zoomInstance = d3.zoom()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => {
        mainGroup.attr("transform", event.transform);
      })
      .on("start", () => {
        svg.classed("grabbing", true);
      })
      .on("end", () => {
        svg.classed("grabbing", false);
      });
    
    svg.call(zoomInstance);

    // Append links with arrows
    const link = mainGroup.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("class", "link")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrowhead)");

    // Create node groups
    const nodeGroup = mainGroup.append("g")
      .selectAll(".node")
      .data(nodes)
      .join("g")
      .attr("class", "node")
      .attr("id", d => `node-${d.data.name.replace(/\s+/g, '-')}-${d.data.lastName.replace(/\s+/g, '-')}`)
      .call(d => {
        // Only add drag behavior to non-root nodes
        if (!d.data || !d.data.isRoot) {
          d.call(dragNode(simulation));
        }
      });
    
    // Store all node groups for later manipulation
    allNodeGroups = nodeGroup;

    function getNodePhotoToUse(node) {
      if (!node?.data) return FALLBACK_PHOTO_URL;
      if (node.data.isRoot) {
        // Root node always uses its photo.
        return normalizePhotoUrl(node.data.photo) || FALLBACK_PHOTO_URL;
      }
      const explicitPhoto = normalizePhotoUrl(node.data.photo);
      if (explicitPhoto) return explicitPhoto;
      // If a valid color is provided, we display color instead of any photo.
      return isValidColorString(node.data.color) ? null : FALLBACK_PHOTO_URL;
    }

    // Add circle borders + conditional fill (color only when no photo)
    nodeGroup.append("circle")
      .attr("r", d => d.data.isRoot ? rootNodeRadius : nodeRadius)
      .attr("fill", d => {
        const photoToUse = getNodePhotoToUse(d);
        if (photoToUse) return "white";
        return normalizeNodeColor(d.data.color);
      })
      .attr("stroke", d => {
        if (d.data.isRoot) return "#000"; // Black rim for central root
        if (!d.data.hasParent) return "#2E8B57"; // Green rim for parentless nodes
        return "#1E90FF"; // Blue rim for regular nodes
      })
      .attr("stroke-width", d => {
        if (d.data.isRoot) return 5;
        return 3;
      });

    // Add clipPath for circular images (created for all nodes)
    nodeGroup.append("clipPath")
      .attr("id", d => `clip-${d.index}`)
      .append("circle")
      .attr("r", d => d.data.isRoot ? rootNodeRadius - 3 : nodeRadius - 3);

    // Add images only when a photo will be displayed
    nodeGroup
      .filter(d => !!getNodePhotoToUse(d))
      .append("image")
      .attr("xlink:href", d => getNodePhotoToUse(d))
      .attr("width", d => d.data.isRoot ? rootNodeRadius * 2 - 6 : nodeRadius * 2 - 6)
      .attr("height", d => d.data.isRoot ? rootNodeRadius * 2 - 6 : nodeRadius * 2 - 6)
      .attr("x", d => d.data.isRoot ? -rootNodeRadius + 3 : -nodeRadius + 3)
      .attr("y", d => d.data.isRoot ? -rootNodeRadius + 3 : -nodeRadius + 3)
      .attr("clip-path", d => `url(#clip-${d.index})`)
      .on("error", function() {
        d3.select(this).attr("xlink:href", FALLBACK_PHOTO_URL);
      });

    // Create a temporary SVG to calculate text width
    const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(tempSvg);
    
    // Add text backgrounds with adaptive width
    nodeGroup.each(function(d) {
      const node = d3.select(this);
      const isRootNode = d.data.isRoot;
      const radius = isRootNode ? rootNodeRadius : nodeRadius;
      const fontSize = isRootNode ? rootNameFontSize : nameFontSize;
      const lastNameSize = isRootNode ? rootLastNameFontSize : lastNameFontSize;
      
      // Calculate first name background width
      const nameText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      nameText.textContent = d.data.name;
      nameText.setAttribute("font-size", fontSize + "px");
      nameText.setAttribute("font-weight", "bold");
      tempSvg.appendChild(nameText);
      const nameWidth = nameText.getBBox().width + textPadding * 2;
      tempSvg.removeChild(nameText);
      
      // Add first name background
      node.append("rect")
        .attr("x", -nameWidth / 2)
        .attr("y", radius + 5)
        .attr("width", nameWidth)
        .attr("height", isRootNode ? 22 : 18) // Taller background for root node
        .attr("rx", isRootNode ? 11 : 9)
        .attr("ry", isRootNode ? 11 : 9)
        .attr("fill", "white")
        .attr("opacity", 0.8);
      
      // Calculate last name background width
      const lastNameText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lastNameText.textContent = d.data.lastName;
      lastNameText.setAttribute("font-size", lastNameSize + "px");
      lastNameText.setAttribute("font-weight", "bold");
      tempSvg.appendChild(lastNameText);
      const lastNameWidth = lastNameText.getBBox().width + textPadding * 2;
      tempSvg.removeChild(lastNameText);
      
      // Add last name background
      node.append("rect")
        .attr("x", -lastNameWidth / 2)
        .attr("y", radius + (isRootNode ? 27 : 23))
        .attr("width", lastNameWidth)
        .attr("height", isRootNode ? 20 : 16) // Taller background for root node
        .attr("rx", isRootNode ? 10 : 8)
        .attr("ry", isRootNode ? 10 : 8)
        .attr("fill", "white")
        .attr("opacity", 0.8);
    });
    
    // Remove the temporary SVG
    document.body.removeChild(tempSvg);

    // Add first name text with appropriate sizing
    nodeGroup.append("text")
      .attr("dy", d => d.data.isRoot ? rootNodeRadius + 22 : nodeRadius + 18)
      .attr("text-anchor", "middle")
      .attr("font-size", d => d.data.isRoot ? rootNameFontSize : nameFontSize)
      .attr("font-weight", "bold")
      .attr("fill", "#333")
      .text(d => d.data.name);

    // Add last name text with appropriate sizing
    nodeGroup.append("text")
      .attr("dy", d => d.data.isRoot ? rootNodeRadius + 42 : nodeRadius + 35)
      .attr("text-anchor", "middle")
      .attr("font-size", d => d.data.isRoot ? rootLastNameFontSize : lastNameFontSize)
      .attr("font-weight", "bold")
      .attr("fill", "#333")
      .text(d => d.data.lastName);

    // Enhanced tooltips with stats
    nodeGroup.append("title")
      .text(d => {
        // Safety check for missing data
        if (!d || !d.data) return "Brak danych";
        
        const role = d.data.isRoot ? " (Korzeń drzewa)" : (!d.data.hasParent ? " (Pramentor)" : "");
        const childrenCount = d.children ? d.children.length : 0;
        
        // Access the descendants count from node.data
        const descendantsCount = d.data.descendantsCount || 0;
        
        const depth = d.depth !== undefined ? d.depth : 'N/A';
        
        return `${d.data.name} ${d.data.lastName}${role}
    Dzieci: ${childrenCount}
    Pokolenie: ${depth}`;
      });

    // Update positions on each tick of the simulation
    simulation.on("tick", () => {
      // Fix the root node at the center
      nodes.forEach(node => {
        if (node.data.isRoot) {
          node.fx = 0;
          node.fy = 0;
        }
      });
      
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Run simulation with higher alpha for better layout
    simulation.alpha(1).restart();

    // Add window resize handler to adjust the viewBox
    window.addEventListener('resize', function() {
      // Simple debounce
      if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(function() {
        adjustViewBox();
      }, 200);
    });

    // Expose functions for external use
    window.findAncestry = findAncestryPath;
    window.restoreAllNodes = restoreAllNodes;
    window.centerOnAncestryRoot = centerOnAncestryRoot;
    
    // Return the SVG element
    return svg.node();
  } catch (error) {
    console.error("Error creating chart:", error);
    const errorDiv = document.createElement("div");
    errorDiv.textContent = "Błąd tworzenia grafu. Sprawdź konsolę.";
    errorDiv.style.color = "red";
    errorDiv.style.padding = "20px";
    errorDiv.style.textAlign = "center";
    return errorDiv;
  }
}

// Find ancestry path between two nodes
function findAncestryPath(person1, person2) {
  // Get all ancestors of person1
  const person1Ancestors = getAllAncestors(person1);
  person1Ancestors.push(person1); // Include person1 itself
  
  // Get all ancestors of person2
  const person2Ancestors = getAllAncestors(person2);
  person2Ancestors.push(person2); // Include person2 itself
  
  // Check if one is a direct ancestor of the other
  const person1IsAncestorOfPerson2 = person2Ancestors.includes(person1);
  const person2IsAncestorOfPerson1 = person1Ancestors.includes(person2);
  let commonAncestor = null;
  
  // Handle direct ancestor case
  if (person1IsAncestorOfPerson2) {
    commonAncestor = person1;
  } else if (person2IsAncestorOfPerson1) {
    commonAncestor = person2;
  } else {
    // Find the lowest common ancestor
    for (const anc1 of person1Ancestors) {
      for (const anc2 of person2Ancestors) {
        if (anc1 === anc2) {
          // Found a common ancestor
          if (!commonAncestor || anc1.depth > commonAncestor.depth) {
            commonAncestor = anc1;
          }
        }
      }
    }
  }
  
  // If no common ancestor found, return early
  if (!commonAncestor) {
    return {
      commonAncestor: null,
      person1Ancestors: person1Ancestors,
      person2Ancestors: person2Ancestors,
      directAncestry: false
    };
  }
  
  // Collect all nodes that should be visible
  const visibleNodes = new Set();
  
  // Direct ancestor relationship
  if (person1IsAncestorOfPerson2) {
    // Only add nodes in the direct path from person2 to person1
    let current = person2;
    while (current && current !== person1) {
      visibleNodes.add(current);
      current = current.parent;
    }
    visibleNodes.add(person1); // Add the ancestor
  } else if (person2IsAncestorOfPerson1) {
    // Only add nodes in the direct path from person1 to person2
    let current = person1;
    while (current && current !== person2) {
      visibleNodes.add(current);
      current = current.parent;
    }
    visibleNodes.add(person2); // Add the ancestor
  } else {
    // MODIFIED: Only include the common ancestor and the paths to the two people
    // Add common ancestor
    visibleNodes.add(commonAncestor);
    
    // Add path from person1 to common ancestor
    let current = person1;
    while (current && current !== commonAncestor) {
      visibleNodes.add(current);
      current = current.parent;
    }
    
    // Add path from person2 to common ancestor
    current = person2;
    while (current && current !== commonAncestor) {
      visibleNodes.add(current);
      current = current.parent;
    }
  }
  
  // Create temporary node with same properties as common ancestor
  tempRoot = {
    data: { ...commonAncestor.data, isRoot: true },
    x: 0,
    y: 0,
    fx: 0,
    fy: 0
  };
  
  // Filter out nodes that are not in the ancestry path (completely remove them)
  const filteredNodes = allNodes.filter(node => visibleNodes.has(node));
  
  // Update simulation with only visible nodes
  simulation.nodes(filteredNodes);
  
  // Show only relevant links
  const filteredLinks = [];
  for (let i = 0; i < filteredNodes.length; i++) {
    const node = filteredNodes[i];
    if (node.parent && visibleNodes.has(node.parent)) {
      filteredLinks.push({source: node.parent, target: node});
    }
  }
  
  // Update links in simulation
  simulation.force("link").links(filteredLinks);
  
  // Show only relevant nodes
  allNodeGroups.style("display", d => {
    return visibleNodes.has(d) ? null : "none";
  });
  
  // Show only relevant links
  d3.selectAll(".link").style("display", d => {
    return (visibleNodes.has(d.source) && visibleNodes.has(d.target)) ? null : "none";
  });
  
  // Store references to the query nodes for highlighting
  tempRoot.queryNode1 = person1;
  tempRoot.queryNode2 = person2;
  
  // MODIFIED: Save current visible nodes set for search functionality
  window.currentVisibleNodes = visibleNodes;
  
  // Position common ancestor at center AND at the top of the hierarchy
  const ancestorNode = document.getElementById(`node-${commonAncestor.data.name.replace(/\s+/g, '-')}-${commonAncestor.data.lastName.replace(/\s+/g, '-')}`);
  if (ancestorNode) {
    // Save original position
    commonAncestor._originalX = commonAncestor.x;
    commonAncestor._originalY = commonAncestor.y;
    
    // Fix position at center
    commonAncestor.fx = 0;
    commonAncestor.fy = 0;
    
    // NEW: Modify the force simulation to position the common ancestor at the top
    // Push the direct descendants down
    filteredNodes.forEach(node => {
      if (node.parent === commonAncestor) {
        // Apply initial positions to help form a tree-like structure
        const isLeftBranch = node === person1 || person1Ancestors.includes(node);
        const xOffset = isLeftBranch ? -100 : 100;
        node.y = 150; // Position below the common ancestor
        node.x = xOffset; // Position to left or right
      }
    });
    
    // NEW: Make the force simulation push children downward
    simulation.force("y", d3.forceY(d => {
      if (d === commonAncestor) return -150; // Push common ancestor to the top
      return 100; // Push other nodes downward
    }).strength(0.1));
    
    // NEW: Add forces to separate the two branches
    simulation.force("x", d3.forceX(d => {
      if (d === commonAncestor) return 0; // Center the common ancestor
      // Split branches based on which person they belong to
      const isFirstBranch = d === person1 || (d.parent && (d.parent === person1 || person1Ancestors.includes(d.parent)));
      return isFirstBranch ? -200 : 200;
    }).strength(0.1));
    
    // Update visual appearance to look like root
    const nodeSelection = d3.select(ancestorNode);
    
    // Make circle bigger
    nodeSelection.select("circle")
      .attr("r", 60)
      .attr("stroke", "#000")
      .attr("stroke-width", 5);

    // If this node currently displays an image, resize it too
    const imageSelection = nodeSelection.select("image");
    if (!imageSelection.empty() && imageSelection.attr("display") !== "none") {
      nodeSelection.select("clipPath circle").attr("r", 57);
      imageSelection
        .attr("width", 114)
        .attr("height", 114)
        .attr("x", -57)
        .attr("y", -57);
    }
    
    // Adjust text position and size
    nodeSelection.selectAll("text").each(function(d, i) {
      const textElement = d3.select(this);
      if (i === 0) { // First name
        textElement.attr("dy", 82)
                   .attr("font-size", 16);
      } else if (i === 1) { // Last name
        textElement.attr("dy", 102)
                   .attr("font-size", 16);
      }
    });
    
    // Adjust text background rectangles
    nodeSelection.selectAll("rect").each(function(d, i) {
      const rect = d3.select(this);
      if (i === 0) { // First name background
        rect.attr("y", 65)
            .attr("height", 22)
            .attr("rx", 11)
            .attr("ry", 11);
      } else if (i === 1) { // Last name background
        rect.attr("y", 87)
            .attr("height", 20)
            .attr("rx", 10)
            .attr("ry", 10);
      }
    });
  }
  
  // Add red rim to selected people
  highlightAncestryNodes(person1, person2, commonAncestor);
  
  // Update simulation with higher alpha to ensure proper layout
  simulation.alpha(1).restart();
  
  // Return the result
  return {
    commonAncestor: commonAncestor,
    person1Ancestors: person1Ancestors,
    person2Ancestors: person2Ancestors,
    directAncestry: person1IsAncestorOfPerson2 || person2IsAncestorOfPerson1
  };
}

// Function to center on the current ancestry root
function centerOnAncestryRoot() {
  // Only applies if we're in ancestry view with a temporary root
  if (!tempRoot) return;
  
  // Find the common ancestor node which is at the center
  const centerNode = allNodes.find(node => node.fx === 0 && node.fy === 0);
  if (centerNode) {
    // Center on this node
    zoomToNode(centerNode);
    showStatusMessage(`Przybliżenie na: ${centerNode.data.name} ${centerNode.data.lastName}`);
  }
}

// NEW: Function to get the currently visible nodes
function getVisibleNodes() {
  return window.currentVisibleNodes || new Set(allNodes);
}

// Restore all nodes to visible state
function restoreAllNodes() {
  // Restore original nodes and links in simulation
  simulation.nodes(allNodes);
  simulation.force("link").links(originalLinks);
  
  // Show all nodes
  allNodeGroups.style("display", null);
  
  // Show all links
  d3.selectAll(".link").style("display", null);
  
  // Remove red rims from all nodes
  d3.selectAll(".node circle").classed("red-rim", false);
  
  // Restore any temporary center node to original position
  if (tempRoot) {
    allNodeGroups.each(function(d) {
      if (d.fx === 0 && d.fy === 0 && !d.data.isRoot) {
        // Restore original position if saved
        if (d._originalX !== undefined && d._originalY !== undefined) {
          d.fx = null;
          d.fy = null;
          d.x = d._originalX;
          d.y = d._originalY;
          delete d._originalX;
          delete d._originalY;
        }
        
        // Restore original appearance
        const nodeSelection = d3.select(this);
        
        // Restore circle size
        nodeSelection.select("circle")
          .attr("r", 30)
          .attr("stroke", d.data.hasParent ? "#1E90FF" : "#2E8B57")
          .attr("stroke-width", 3);

        const imageSelection = nodeSelection.select("image");
        if (!imageSelection.empty() && imageSelection.attr("display") !== "none") {
          nodeSelection.select("clipPath circle").attr("r", 27);
          imageSelection
            .attr("width", 54)
            .attr("height", 54)
            .attr("x", -27)
            .attr("y", -27);
        }
        
        // Restore text position and size
        nodeSelection.selectAll("text").each(function(d, i) {
          const textElement = d3.select(this);
          if (i === 0) { // First name
            textElement.attr("dy", 48)
                       .attr("font-size", 12);
          } else if (i === 1) { // Last name
            textElement.attr("dy", 65)
                       .attr("font-size", 12);
          }
        });
        
        // Restore text background rectangles
        nodeSelection.selectAll("rect").each(function(d, i) {
          const rect = d3.select(this);
          if (i === 0) { // First name background
            rect.attr("y", 35)
                .attr("height", 18)
                .attr("rx", 9)
                .attr("ry", 9);
          } else if (i === 1) { // Last name background
            rect.attr("y", 53)
                .attr("height", 16)
                .attr("rx", 8)
                .attr("ry", 8);
          }
        });
      }
    });
    
    // Clear the current visible nodes
    window.currentVisibleNodes = null;
    tempRoot = null;
    
    // Restore default forces
    simulation.force("y", d3.forceY());
    simulation.force("x", d3.forceX());
  }
  
  // Update simulation
  simulation.alpha(0.3).restart();
}

// At the end of createChart function, expose additional functions:
window.findAncestry = findAncestryPath;
window.restoreAllNodes = restoreAllNodes;
window.centerOnAncestryRoot = centerOnAncestryRoot;
window.getVisibleNodes = getVisibleNodes; // NEW: Expose this function

// Function to highlight selected nodes in ancestry view with red rims
function highlightAncestryNodes(person1, person2, commonAncestor) {
  // Get the node elements for the selected people
  const person1Id = `node-${person1.data.name.replace(/\s+/g, '-')}-${person1.data.lastName.replace(/\s+/g, '-')}`;
  const person2Id = `node-${person2.data.name.replace(/\s+/g, '-')}-${person2.data.lastName.replace(/\s+/g, '-')}`;
  
  // Add red rim to person1 (unless it's the common ancestor and already styled as root)
  const person1Element = document.getElementById(person1Id);
  if (person1Element) {
    const circle = d3.select(person1Element).select('circle');
    if (person1 !== commonAncestor || commonAncestor === person1) {
      circle.classed('red-rim', true);
    }
  }
  
  // Add red rim to person2 (unless it's the common ancestor and already styled as root)
  const person2Element = document.getElementById(person2Id);
  if (person2Element) {
    const circle = d3.select(person2Element).select('circle');
    if (person2 !== commonAncestor || commonAncestor === person2) {
      circle.classed('red-rim', true);
    }
  }
}

// Function to center on the current ancestry root
function centerOnAncestryRoot() {
  // Only applies if we're in ancestry view with a temporary root
  if (!tempRoot) return;
  
  // Find the common ancestor node which is at the center
  const centerNode = allNodes.find(node => node.fx === 0 && node.fy === 0);
  if (centerNode) {
    // Center on this node
    zoomToNode(centerNode);
    showStatusMessage(`Przybliżenie na: ${centerNode.data.name} ${centerNode.data.lastName}`);
  }
}

// Function to zoom to a specific node
function zoomToNode(node) {
  if (!svgElement || !zoomInstance) return;
  
  // Reset zoom and center on the node
  svgElement
    .transition()
    .duration(750)
    .call(
      zoomInstance.transform,
      d3.zoomIdentity.translate(0, 0).scale(1)
    );
}

// Get all ancestors of a node
function getAllAncestors(node) {
  const ancestors = [];
  let current = node.parent;
  
  while (current) {
    if (!current.data.isRoot) { // Skip the root node
      ancestors.push(current);
    }
    current = current.parent;
  }
  
  return ancestors;
}

// Restore all nodes to visible state
function restoreAllNodes() {
  // Restore original nodes and links in simulation
  simulation.nodes(allNodes);
  simulation.force("link").links(originalLinks);
  
  // Show all nodes
  allNodeGroups.style("display", null);
  
  // Show all links
  d3.selectAll(".link").style("display", null);
  
  // Remove red rims from all nodes
  d3.selectAll(".node circle").classed("red-rim", false);
  
  // Restore any temporary center node to original position
  if (tempRoot) {
    allNodeGroups.each(function(d) {
      if (d.fx === 0 && d.fy === 0 && !d.data.isRoot) {
        // Restore original position if saved
        if (d._originalX !== undefined && d._originalY !== undefined) {
          d.fx = null;
          d.fy = null;
          d.x = d._originalX;
          d.y = d._originalY;
          delete d._originalX;
          delete d._originalY;
        }
        
        // Restore original appearance
        const nodeSelection = d3.select(this);
        
        // Restore circle size
        nodeSelection.select("circle")
          .attr("r", 30)
          .attr("stroke", d.data.hasParent ? "#1E90FF" : "#2E8B57")
          .attr("stroke-width", 3);
        
        // Restore text position and size
        nodeSelection.selectAll("text").each(function(d, i) {
          const textElement = d3.select(this);
          if (i === 0) { // First name
            textElement.attr("dy", 48)
                       .attr("font-size", 12);
          } else if (i === 1) { // Last name
            textElement.attr("dy", 65)
                       .attr("font-size", 12);
          }
        });
        
        // Restore text background rectangles
        nodeSelection.selectAll("rect").each(function(d, i) {
          const rect = d3.select(this);
          if (i === 0) { // First name background
            rect.attr("y", 35)
                .attr("height", 18)
                .attr("rx", 9)
                .attr("ry", 9);
          } else if (i === 1) { // Last name background
            rect.attr("y", 53)
                .attr("height", 16)
                .attr("rx", 8)
                .attr("ry", 8);
          }
        });
      }
    });
    
    tempRoot = null;
  }
  
  // Update simulation
  simulation.alpha(0.3).restart();
}

// Function to adjust viewBox based on container size
function adjustViewBox() {
  if (!svgElement) return;
  
  const container = document.getElementById("chart-container");
  if (!container) return;
  
  const containerRect = container.getBoundingClientRect();
  const width = containerRect.width;
  const height = containerRect.height;
  
  svgElement.attr("viewBox", [-width/2, -height/2, width, height]);
  
  if (zoomInstance) {
    zoomInstance.extent([[0, 0], [width, height]]);
    svgElement.call(zoomInstance);
  }
}

// Function for dragging individual nodes
function dragNode(simulation) {
  function dragstarted(event, d) {
    // Skip if this is the root node or a temporary center node
    if (d.data.isRoot || (d.fx === 0 && d.fy === 0)) return;
    
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
    
    // Add grabbing cursor
    d3.select(this).classed("dragging", true);
  }
  
  function dragged(event, d) {
    // Skip if this is the root node or a temporary center node
    if (d.data.isRoot || (d.fx === 0 && d.fy === 0)) return;
    
    d.fx = event.x;
    d.fy = event.y;
  }
  
  function dragended(event, d) {
    // Skip if this is the root node or a temporary center node
    if (d.data.isRoot || (d.fx === 0 && d.fy === 0)) return;
    
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
    
    // Remove grabbing cursor
    d3.select(this).classed("dragging", false);
  }
  
  return d3.drag()
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended);
}

// Function to focus on a specific node
function focusOnNode(node) {
  if (!node || !svgElement || !zoomInstance) {
    console.error("Missing required elements for zoom", { node, svgElement, zoomInstance });
    return;
  }
  
  // Calculate zoom transform to center on node
  const scale = 1.5; // Zoom level
  
  // Transform calculation to properly center the node
  const x = -node.x * scale;
  const y = -node.y * scale;
  
  // Apply the transform with transition
  svgElement
    .transition()
    .duration(750)
    .call(
      zoomInstance.transform,
      d3.zoomIdentity.translate(x, y).scale(scale)
    );
  
  // Highlight the node with a visual effect
  highlightNode(node);
  
  // Add status message
  const statusMsg = document.getElementById('status-message');
  if (statusMsg) {
    statusMsg.textContent = `Przybliżenie na: ${node.data.name} ${node.data.lastName}`;
    statusMsg.style.opacity = 1;
    
    // Fade out the status message
    setTimeout(() => {
      statusMsg.style.opacity = 0;
    }, 2000);
  }
}

// Function to highlight a node with visual effect
function highlightNode(node) {
  // Create safe ID for selection
  const safeId = `node-${node.data.name.replace(/\s+/g, '-')}-${node.data.lastName.replace(/\s+/g, '-')}`;
  const nodeElement = document.getElementById(safeId);
  
  if (!nodeElement) {
    console.error("Node element not found:", safeId);
    return;
  }
  
  // Add highlight effect
  const circle = d3.select(nodeElement).select('circle');
  
  // Store original attributes
  const originalStroke = circle.attr('stroke');
  const originalStrokeWidth = circle.attr('stroke-width');
  
  // Apply highlight
  circle
    .transition()
    .duration(300)
    .attr('stroke', '#FF8C00')
    .attr('stroke-width', 5)
    .transition()
    .delay(1700)
    .duration(300)
    .attr('stroke', originalStroke)
    .attr('stroke-width', originalStrokeWidth);
  
  // Add a pulse animation
  const pulseCircle = d3.select(nodeElement)
    .append('circle')
    .attr('r', nodeElement.querySelector('circle').getAttribute('r'))
    .attr('fill', 'none')
    .attr('stroke', '#FF8C00')
    .attr('stroke-width', 3)
    .attr('opacity', 1);
  
  // Animate the pulse
  pulseCircle
    .transition()
    .duration(1000)
    .attr('r', 50)
    .attr('opacity', 0)
    .remove();
}

// Function to reset the view to show all nodes
function resetView() {
  if (!svgElement || !zoomInstance) return;
  
  svgElement
    .transition()
    .duration(750)
    .call(
      zoomInstance.transform,
      d3.zoomIdentity
    );
}

// Function to show status message
function showStatusMessage(message) {
  const statusMsg = document.getElementById('status-message');
  if (statusMsg) {
    statusMsg.textContent = message;
    statusMsg.style.opacity = 1;
    
    // Fade out the status message
    setTimeout(() => {
      statusMsg.style.opacity = 0;
    }, 2000);
  }
}

// Add a loading indicator that shows while data is being fetched
function showLoadingIndicator() {
  const container = document.getElementById("chart-container");
  if (!container) return;
  
  const loader = document.createElement("div");
  loader.id = "loading-indicator";
  loader.innerHTML = "Ładowanie danych...";
  container.appendChild(loader);
}

function hideLoadingIndicator() {
  const loader = document.getElementById("loading-indicator");
  if (loader) {
    loader.remove();
  }
}

// Create and append the chart to the document when the page loads
document.addEventListener('DOMContentLoaded', async function() {
  showLoadingIndicator();
  const chartContainer = document.getElementById("chart-container");
  
  // Create and add the chart
  const chart = await createChart();
  chartContainer.appendChild(chart);
  
  // Adjust viewBox to match container size
  setTimeout(adjustViewBox, 100);
  
  hideLoadingIndicator();
});