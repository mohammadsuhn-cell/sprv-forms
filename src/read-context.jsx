import { createContext, useContext } from "react";
import { readGeneralData, readStudentData } from "./delivery.js";
export const ReadContext = createContext({
  general: readGeneralData,
  student: readStudentData,
  local: false,
});
export const useReads = () => useContext(ReadContext);

// Separate from the snapshot reader: an old offline copy must not supply the
// identity of the person exporting it today.
export const ExporterContext = createContext("");
export const useExporter = () => useContext(ExporterContext);
