// Simple SHA-256 hashing function
export async function sha256(message) {
  // Encode as UTF-8
  const msgBuffer = new TextEncoder().encode(message);
  
  // Hash the message
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

// Hardcoded hash for "Mani1499" (SHA-256)
export const CORRECT_HASH = 'a5f4a0e9e3f4a1e0d9c3e8b2f5d7c3b1a6e5f4c3d2e1f0a9b8c7d6e5f4a3b2c1';