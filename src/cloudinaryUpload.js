const CLOUD_NAME = "ioaw17um";
const UPLOAD_PRESET = "travelwings_invoices";

export const uploadInvoice = async (file) => {
  const data = new FormData();

  data.append("file", file);
  data.append("upload_preset", UPLOAD_PRESET);
  data.append("folder", "travelwings/invoices");

  const type = file.type === "application/pdf" ? "raw" : "image";

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${type}/upload`,
    {
      method: "POST",
      body: data
    }
  );

  if (!response.ok) {
    throw new Error("Cloudinary upload failed");
  }

  return await response.json();
};