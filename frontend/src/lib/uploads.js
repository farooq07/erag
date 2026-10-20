// Shared by the composer's attach menu and the documents panel.
export const UPLOAD_ACCEPT = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "text/plain": [".txt", ".md"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
};

// The department an upload goes to: the user's choice if they may write there,
// else their default department, else the first one they can write to.
export function effectiveUploadDept(choice, writable, defaultDept) {
  if (!writable.length || writable.includes(choice)) return choice;
  return writable.includes(defaultDept) ? defaultDept : writable[0];
}
