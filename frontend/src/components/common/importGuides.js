import { adminApi, employerJobApi } from "../../services";

/**
 * Format guide + sample download for each import. The spec (columns, required, examples) comes from
 * the API, which builds the sample file from the same definition the importer reads.
 */
export const adminImportGuide = (kind, params = {}) => ({
  key: ["admin", kind, params.type || ""],
  load: () => adminApi.get(`/import-templates/${kind}`, params),
  download: (format) =>
    adminApi.download(
      `/import-templates/${kind}`,
      { ...params, format },
      `freejobwala-${kind}-sample.${format}`,
    ),
});

export const employerJobsImportGuide = {
  key: ["employer", "jobs"],
  load: employerJobApi.importTemplate,
  download: employerJobApi.downloadImportTemplate,
};
