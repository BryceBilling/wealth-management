import { isTauri } from "@tauri-apps/api/core";
export async function saveBytes(
  name: string,
  data: Uint8Array,
  mime = "application/octet-stream",
) {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      defaultPath: name,
      filters: [
        {
          name: "Tandem file",
          extensions: [name.split(".").at(-1) ?? "tandem"],
        },
      ],
    });
    if (!path) throw Error("Save cancelled. No data was changed.");
    await writeFile(path, data);
  } else {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([new Uint8Array(data)], { type: mime }),
    );
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
export async function download(name: string, data: unknown) {
  await saveBytes(
    name,
    new TextEncoder().encode(JSON.stringify(data)),
    "application/json",
  );
}
