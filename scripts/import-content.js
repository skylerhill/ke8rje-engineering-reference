const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");


/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const ROOT_DIRECTORY = process.cwd();

const SRC_DIRECTORY = path.join(
    ROOT_DIRECTORY,
    "src"
);

const IMPORT_DIRECTORY = path.join(
    ROOT_DIRECTORY,
    "data",
    "imports"
);

const MANIFEST_PATH = path.join(
    IMPORT_DIRECTORY,
    ".import-manifest.json"
);

const VALIDATOR = path.join(
    ROOT_DIRECTORY,
    "scripts",
    "validate-content.js"
);


/* -------------------------------------------------------------------------- */
/* YAML Utilities                                                             */
/* -------------------------------------------------------------------------- */

function yamlScalar(value) {
    const text = String(value);

    const ambiguousWords =
        /^(?:true|false|null|yes|no|on|off|~)$/i;

    const numericLike =
        /^[-+]?(?:\d+|\d*\.\d+)$/;

    const unsafeCharacters =
        /[:#[\]{},&*!|>'"%@`]/;

    const unsafeWhitespace =
        /^\s|\s$/;

    if (
        text === "" ||
        ambiguousWords.test(text) ||
        numericLike.test(text) ||
        unsafeCharacters.test(text) ||
        unsafeWhitespace.test(text)
    ) {
        return JSON.stringify(text);
    }

    return text;
}


function buildScalarField(name, value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return "";
    }

    return `${name}: ${yamlScalar(value)}\n`;
}


function buildListField(name, values) {
    if (
        !Array.isArray(values) ||
        values.length === 0
    ) {
        return "";
    }

    const items = values
        .map(
            (value) =>
                `  - ${yamlScalar(value)}`
        )
        .join("\n");

    return `${name}:\n${items}\n`;
}


/* -------------------------------------------------------------------------- */
/* Hash Utilities                                                             */
/* -------------------------------------------------------------------------- */

/*
 * The manifest stores the SHA-256 hash of the exact canonical Markdown
 * content last written by this importer.
 *
 * This lets the importer distinguish between:
 *
 *   1. A file that still exactly matches the last importer-generated state.
 *      That file can be updated safely.
 *
 *   2. A file that has changed since the importer last wrote it.
 *      That file may contain manual edits and must not be overwritten.
 */

function hashContent(content) {
    return crypto
        .createHash("sha256")
        .update(content, "utf8")
        .digest("hex");
}


/* -------------------------------------------------------------------------- */
/* Import Manifest                                                            */
/* -------------------------------------------------------------------------- */

function createEmptyManifest() {
    return {
        version: 1,
        files: {}
    };
}


async function loadManifest() {
    let raw;

    try {
        raw = await fs.readFile(
            MANIFEST_PATH,
            "utf8"
        );
    } catch (error) {
        if (error.code === "ENOENT") {
            return createEmptyManifest();
        }

        throw error;
    }

    let manifest;

    try {
        manifest = JSON.parse(raw);
    } catch (error) {
        throw new Error(
            `.import-manifest.json is invalid JSON: ${error.message}`
        );
    }

    if (
        !manifest ||
        typeof manifest !== "object" ||
        Array.isArray(manifest)
    ) {
        throw new Error(
            ".import-manifest.json must contain an object."
        );
    }

    if (manifest.version !== 1) {
        throw new Error(
            `.import-manifest.json uses unsupported version ` +
            `"${manifest.version}".`
        );
    }

    if (
        !manifest.files ||
        typeof manifest.files !== "object" ||
        Array.isArray(manifest.files)
    ) {
        throw new Error(
            ".import-manifest.json is missing a valid files object."
        );
    }

    return manifest;
}


async function saveManifest(manifest) {
    const output =
        `${JSON.stringify(manifest, null, 2)}\n`;

    await fs.writeFile(
        MANIFEST_PATH,
        output,
        "utf8"
    );
}


function getManifestKey(
    collection,
    id
) {
    return `${collection}/${id}/index.md`;
}


/* -------------------------------------------------------------------------- */
/* Import File Loading                                                        */
/* -------------------------------------------------------------------------- */

async function loadImportFiles() {
    let entries;

    try {
        entries = await fs.readdir(
            IMPORT_DIRECTORY,
            {
                withFileTypes: true
            }
        );
    } catch (error) {
        if (error.code === "ENOENT") {
            throw new Error(
                `Import directory does not exist: ${IMPORT_DIRECTORY}`
            );
        }

        throw error;
    }

    const jsonFiles = entries
        .filter(
            (entry) =>
                entry.isFile() &&
                entry.name.toLowerCase().endsWith(".json") &&
                entry.name !== ".import-manifest.json"
        )
        .map((entry) => entry.name)
        .sort();

    if (jsonFiles.length === 0) {
        throw new Error(
            `No JSON import files found in ${IMPORT_DIRECTORY}`
        );
    }

    const groups = [];

    for (const fileName of jsonFiles) {
        const filePath = path.join(
            IMPORT_DIRECTORY,
            fileName
        );

        const raw = await fs.readFile(
            filePath,
            "utf8"
        );

        let parsed;

        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            throw new Error(
                `${fileName}: invalid JSON: ${error.message}`
            );
        }

        validateImportFile(
            fileName,
            parsed
        );

        groups.push({
            fileName,
            ...parsed
        });
    }

    return groups;
}


/* -------------------------------------------------------------------------- */
/* Import File Validation                                                     */
/* -------------------------------------------------------------------------- */

function validateImportFile(
    fileName,
    group
) {
    if (
        !group ||
        typeof group !== "object" ||
        Array.isArray(group)
    ) {
        throw new Error(
            `${fileName}: root value must be an object.`
        );
    }

    if (
        typeof group.collection !== "string" ||
        group.collection.trim() === ""
    ) {
        throw new Error(
            `${fileName}: missing collection.`
        );
    }

    if (
        typeof group.entity !== "string" ||
        group.entity.trim() === ""
    ) {
        throw new Error(
            `${fileName}: missing entity.`
        );
    }

    if (!Array.isArray(group.items)) {
        throw new Error(
            `${fileName}: items must be an array.`
        );
    }

    const ids = new Set();

    for (
        const [index, item]
        of group.items.entries()
    ) {
        if (
            !item ||
            typeof item !== "object" ||
            Array.isArray(item)
        ) {
            throw new Error(
                `${fileName}: item ${index + 1} must be an object.`
            );
        }

        if (
            typeof item.id !== "string" ||
            item.id.trim() === ""
        ) {
            throw new Error(
                `${fileName}: item ${index + 1} is missing id.`
            );
        }

        if (
            typeof item.title !== "string" ||
            item.title.trim() === ""
        ) {
            throw new Error(
                `${fileName}: ${item.id} is missing title.`
            );
        }

        if (ids.has(item.id)) {
            throw new Error(
                `${fileName}: duplicate id "${item.id}".`
            );
        }

        ids.add(item.id);
    }
}


/* -------------------------------------------------------------------------- */
/* Markdown Builder                                                           */
/* -------------------------------------------------------------------------- */

/*
 * These fields are emitted first and in a predictable order.
 *
 * Deterministic output makes generated Markdown easy to review and allows
 * hashes in the import manifest to reliably represent generated state.
 */

const FIELD_ORDER = [
    "institution",
    "location",
    "credential_type",
    "study_type",
    "field",
    "concentration",
    "code",
    "credits",
    "term",
    "start",
    "end",
    "employer",
    "position",
    "study",
    "credentials",
    "competencies",
    "software",
    "projects",
    "standards"
];


/*
 * Properties used by the importer itself rather than written as ordinary
 * front-matter fields.
 */

const RESERVED_FIELDS = new Set([
    "id",
    "title",
    "description"
]);


function buildDataField(
    name,
    value
) {
    if (Array.isArray(value)) {
        return buildListField(
            name,
            value
        );
    }

    return buildScalarField(
        name,
        value
    );
}


function buildMarkdown(
    collection,
    entity,
    item
) {
    let output = "---\n";

    output +=
        `title: ${yamlScalar(item.title)}\n`;

    output +=
        "layout: entity\n";

    output +=
        `permalink: /${collection}/${item.id}/\n`;

    output += "\n";

    output +=
        `id: ${yamlScalar(item.id)}\n`;

    output +=
        `entity: ${yamlScalar(entity)}\n`;


    /* ---------------------------------------------------------------------- */
    /* Known Fields                                                           */
    /* ---------------------------------------------------------------------- */

    const emitted = new Set();

    for (const field of FIELD_ORDER) {
        if (
            Object.prototype.hasOwnProperty.call(
                item,
                field
            )
        ) {
            output += buildDataField(
                field,
                item[field]
            );

            emitted.add(field);
        }
    }


    /* ---------------------------------------------------------------------- */
    /* Additional Fields                                                      */
    /* ---------------------------------------------------------------------- */

    /*
     * The importer remains content-agnostic.
     *
     * A future entity can introduce a simple scalar or list field in its
     * import JSON without requiring another hard-coded branch here.
     */

    const additionalFields =
        Object.keys(item)
            .filter(
                (field) =>
                    !RESERVED_FIELDS.has(field) &&
                    !emitted.has(field)
            )
            .sort();

    for (const field of additionalFields) {
        output += buildDataField(
            field,
            item[field]
        );
    }


    /* ---------------------------------------------------------------------- */
    /* Markdown Body                                                          */
    /* ---------------------------------------------------------------------- */

    output += "---\n\n";

    const description =
        typeof item.description === "string"
            ? item.description.trim()
            : "";

    if (description) {
        output += `${description}\n`;
    }

    return output;
}


/* -------------------------------------------------------------------------- */
/* File Utilities                                                             */
/* -------------------------------------------------------------------------- */

async function ensureDirectory(directory) {
    await fs.mkdir(
        directory,
        {
            recursive: true
        }
    );
}


/* -------------------------------------------------------------------------- */
/* Entity Import                                                              */
/* -------------------------------------------------------------------------- */

async function importEntity(
    group,
    item,
    manifest
) {
    const directory = path.join(
        SRC_DIRECTORY,
        group.collection,
        item.id
    );

    const filePath = path.join(
        directory,
        "index.md"
    );

    const manifestKey =
        getManifestKey(
            group.collection,
            item.id
        );

    const expectedContent =
        buildMarkdown(
            group.collection,
            group.entity,
            item
        );

    const expectedHash =
        hashContent(expectedContent);

    await ensureDirectory(directory);

    let existingContent;

    try {
        existingContent =
            await fs.readFile(
                filePath,
                "utf8"
            );
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }

        await fs.writeFile(
            filePath,
            expectedContent,
            "utf8"
        );

        manifest.files[manifestKey] = {
            hash: expectedHash,
            source: group.fileName
        };

        console.log(
            `Created:   ${group.collection}/${item.id}`
        );

        return "created";
    }


    /*
     * Exact match.
     *
     * This is safe regardless of whether the file was previously recorded
     * in the manifest because the canonical file already equals the current
     * deterministic import output.
     *
     * This also bootstraps existing importer-generated files into the new
     * manifest without requiring a destructive migration.
     */

    if (existingContent === expectedContent) {
        manifest.files[manifestKey] = {
            hash: expectedHash,
            source: group.fileName
        };

        console.log(
            `Unchanged: ${group.collection}/${item.id}`
        );

        return "unchanged";
    }


    /*
     * Different file with no manifest record.
     *
     * We cannot prove who created or modified it, so preserve the existing
     * canonical file and report a conflict.
     */

    const manifestEntry =
        manifest.files[manifestKey];

    if (!manifestEntry) {
        console.error(
            `Conflict: ${group.collection}/${item.id}`
        );

        console.error(
            `  Source: ${group.fileName}`
        );

        console.error(
            "  Existing canonical file differs from import data."
        );

        console.error(
            "  No previous importer state exists for this file."
        );

        console.error(
            "  Refusing to overwrite canonical content."
        );

        return "conflict";
    }


    /*
     * A manifest record exists.
     *
     * Compare the current canonical file against the exact content hash
     * recorded the last time the importer managed it.
     */

    const existingHash =
        hashContent(existingContent);

    if (existingHash !== manifestEntry.hash) {
        console.error(
            `Conflict: ${group.collection}/${item.id}`
        );

        console.error(
            `  Source: ${group.fileName}`
        );

        console.error(
            "  Canonical content has changed since the importer last wrote it."
        );

        console.error(
            "  Refusing to overwrite possible manual edits."
        );

        return "conflict";
    }


    /*
     * The canonical file still matches the last importer-generated state.
     *
     * The import data has changed, so updating the canonical file is safe.
     */

    await fs.writeFile(
        filePath,
        expectedContent,
        "utf8"
    );

    manifest.files[manifestKey] = {
        hash: expectedHash,
        source: group.fileName
    };

    console.log(
        `Updated:   ${group.collection}/${item.id}`
    );

    return "updated";
}


/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function runValidator() {
    console.log(
        "\nRunning content validation...\n"
    );

    const result = spawnSync(
        process.execPath,
        [VALIDATOR],
        {
            cwd: ROOT_DIRECTORY,
            stdio: "inherit"
        }
    );

    if (result.error) {
        throw result.error;
    }

    return result.status === 0;
}


/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
    console.log(
        "\nEngineering Reference — Import Content\n"
    );

    const groups =
        await loadImportFiles();

    const manifest =
        await loadManifest();

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let conflicts = 0;

    for (const group of groups) {
        console.log(
            `Importing ${group.fileName}...`
        );

        for (const item of group.items) {
            const result =
                await importEntity(
                    group,
                    item,
                    manifest
                );

            if (result === "created") {
                created += 1;
            }

            if (result === "updated") {
                updated += 1;
            }

            if (result === "unchanged") {
                unchanged += 1;
            }

            if (result === "conflict") {
                conflicts += 1;
            }
        }

        console.log("");
    }

    console.log(
        `Created ${created} entities.`
    );

    console.log(
        `Updated ${updated} entities.`
    );

    console.log(
        `Unchanged ${unchanged} entities.`
    );

    /*
     * Do not save new manifest state when any conflict exists.
     *
     * This keeps a failed import from partially advancing the persisted
     * importer state.
     */

    if (conflicts > 0) {
        console.error(
            `Conflicts ${conflicts} entities.`
        );

        console.error(
            "\nImport stopped because existing canonical " +
            "content would have been overwritten."
        );

        process.exitCode = 1;
        return;
    }

    const valid =
        runValidator();

    if (!valid) {
        console.error(
            "\nImport completed, but content validation failed."
        );

        console.error(
            "The import manifest was not updated."
        );

        process.exitCode = 1;
        return;
    }

    await saveManifest(manifest);

    console.log(
        "\nImport manifest updated."
    );

    console.log(
        "Import completed successfully."
    );
}


main().catch((error) => {
    console.error(
        `\nImport failed: ${error.message}`
    );

    process.exitCode = 1;
});