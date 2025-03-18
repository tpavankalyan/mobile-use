import { XMLParser } from "fast-xml-parser";

interface UiElement {
  id?: string;
  type: string;
  text?: string;
  desc?: string;
  clickable: boolean;
  bounds: string;
  children?: UiElement[];
}

/**
 * Parses ADB UI dumps into a simplified tree for AI agent navigation
 */
export function parseUiDump(xmlDump: string): UiElement {
  const options = {
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: true,
    isArray: (name: string) => name === "node",
  };

  const parser = new XMLParser(options);
  const parsed = parser.parse(xmlDump);

  if (parsed.hierarchy && parsed.hierarchy.node && parsed.hierarchy.node[0]) {
    return simplifyNode(parsed.hierarchy.node[0]);
  }

  return { type: "root", clickable: false, bounds: "[0,0][0,0]" };
}

/**
 * Safely checks if a string has content
 */
function hasContent(str: any): boolean {
  return typeof str === "string" && str !== "";
}

/**
 * Converts a complex node into a simplified structure
 */
function simplifyNode(node: any): UiElement {
  // Extract only the most essential properties
  const element: UiElement = {
    type: getElementType(node),
    clickable: node.clickable === "true",
    bounds: node.bounds || "[0,0][0,0]",
  };

  // Only include text if it exists and has content
  if (hasContent(node.text)) {
    element.text = node.text;
  }

  // Include content description if available
  if (hasContent(node["content-desc"])) {
    element.desc = node["content-desc"];
  }

  // Include resource ID but simplify it
  if (hasContent(node["resource-id"])) {
    // Extract just the name part of the ID for readability
    const idParts = node["resource-id"].split("/");
    element.id = idParts[idParts.length - 1];
  }

  // Process children if they exist
  if (node.node && node.node.length > 0) {
    // Skip intermediate containers
    if (shouldCollapseContainer(node)) {
      // Directly include children of this container instead
      element.children = flattenChildren(node.node);
    } else {
      // Only include meaningful children
      const meaningfulChildren = node.node
        .filter((child: any) => isMeaningfulNode(child))
        .map((child: any) => simplifyNode(child));

      if (meaningfulChildren.length > 0) {
        element.children = meaningfulChildren;
      }
    }
  }

  return element;
}

/**
 * Determines if a container node should be collapsed to reduce tree depth
 */
function shouldCollapseContainer(node: any): boolean {
  // Skip intermediate containers that just add nesting
  return (
    !hasContent(node.text) &&
    !hasContent(node["content-desc"]) &&
    node.clickable !== "true" &&
    node.scrollable !== "true" &&
    !hasContent(node["resource-id"]) &&
    (node.class?.includes("Layout") || node.class?.includes("ViewGroup"))
  );
}

/**
 * Flattens children of intermediate containers
 */
function flattenChildren(nodes: any[]): UiElement[] {
  let result: UiElement[] = [];

  for (const child of nodes) {
    if (shouldCollapseContainer(child) && child.node) {
      // Recursively flatten this container's children
      result = result.concat(flattenChildren(child.node));
    } else if (isMeaningfulNode(child)) {
      // Add this meaningful node
      result.push(simplifyNode(child));
    }
  }

  return result;
}

/**
 * Determines if a node has meaningful content for an agent
 */
function isMeaningfulNode(node: any): boolean {
  // Keep nodes that are interactive
  if (node.clickable === "true" || node.scrollable === "true") {
    return true;
  }

  // Keep nodes with text or content description
  if (hasContent(node.text) || hasContent(node["content-desc"])) {
    return true;
  }

  // Keep nodes with specific resource IDs
  if (hasContent(node["resource-id"])) {
    return true;
  }

  // Check if the node has meaningful children
  if (node.node && node.node.length > 0) {
    return node.node.some((child: any) => isMeaningfulNode(child));
  }

  return false;
}

/**
 * Maps Android UI element classes to simpler type names
 */
function getElementType(node: any): string {
  const className = node.class || "";

  // Map common Android classes to simpler types
  if (className.includes("Button")) return "button";
  if (className.includes("EditText")) return "input";
  if (className.includes("TextView")) return "text";
  if (className.includes("ImageView")) return "image";
  if (className.includes("CheckBox")) return "checkbox";
  if (className.includes("RadioButton")) return "radio";
  if (className.includes("RecyclerView") || className.includes("ListView"))
    return "list";
  if (className.includes("CardView")) return "card";

  // Special case for dialpad buttons
  if (
    hasContent(node["resource-id"]) &&
    (node["resource-id"].includes("one") ||
      node["resource-id"].includes("two") ||
      node["resource-id"].includes("three") ||
      node["resource-id"].includes("four") ||
      node["resource-id"].includes("five") ||
      node["resource-id"].includes("six") ||
      node["resource-id"].includes("seven") ||
      node["resource-id"].includes("eight") ||
      node["resource-id"].includes("nine") ||
      node["resource-id"].includes("zero") ||
      node["resource-id"].includes("star") ||
      node["resource-id"].includes("pound"))
  ) {
    return "dialpad_button";
  }

  return "view";
}

/**
 * Creates a simple text summary of key UI elements for the agent
 */
export function describeUi(ui: UiElement): string {
  const interactiveElements = findAllInteractiveElements(ui);

  if (interactiveElements.length === 0) {
    return "No interactive elements found.";
  }

  let summary = `Found ${interactiveElements.length} interactive elements:\n`;

  interactiveElements.forEach((el, i) => {
    const description = [
      el.text ? `"${el.text}"` : "",
      el.desc ? `(${el.desc})` : "",
      el.id ? `[${el.id}]` : "",
      el.type,
    ]
      .filter(Boolean)
      .join(" ");

    summary += `${i + 1}. ${description} at ${el.bounds}\n`;
  });

  return summary;
}

/**
 * Finds all interactive elements in the UI
 */
function findAllInteractiveElements(element: UiElement): UiElement[] {
  let results: UiElement[] = [];

  if (
    element.clickable ||
    element.type === "input" ||
    element.type === "list"
  ) {
    results.push(element);
  }

  if (element.children) {
    for (const child of element.children) {
      results = results.concat(findAllInteractiveElements(child));
    }
  }

  return results;
}
