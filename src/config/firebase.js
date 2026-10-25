import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBcuupQwxTjgt0-U2UtT86H_lcylqA1xTw",
  authDomain: "travel-wings-9d7cb.firebaseapp.com",
  projectId: "travel-wings-9d7cb",
  storageBucket: "travel-wings-9d7cb.firebasestorage.app",
  messagingSenderId: "226352757263",
  appId: "1:226352757263:web:0d4bfbf5f4f65f19e5817a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };