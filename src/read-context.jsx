import { createContext, useContext } from "react";
import { readGeneralData, readStudentData } from "./delivery.js";
export const ReadContext = createContext({
  general: readGeneralData,
  student: readStudentData,
  local: false,
});
export const useReads = () => useContext(ReadContext);
