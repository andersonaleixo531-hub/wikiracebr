
import * as firebaseApp from "firebase/app";
import { getDatabase } from "firebase/database";

// As regras de segurança atualizadas foram fornecidas no JSON acima.
// Elas garantem que salas sejam criadas corretamente e que o status/vencedor sejam protegidos.

const firebaseConfig = {
  apiKey: "AIzaSyDzAfhmBydEqJvEaVukcqLLQND3ZXYPpxA",
  authDomain: "wikibr-f78f9.firebaseapp.com",
  databaseURL: "https://wikibr-f78f9-default-rtdb.firebaseio.com",
  projectId: "wikibr-f78f9",
};

const app = firebaseApp.initializeApp(firebaseConfig);
export const db = getDatabase(app);
