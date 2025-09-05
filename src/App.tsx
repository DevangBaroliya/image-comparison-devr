// App.tsx
import { useState, useEffect, useRef } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import {
  useForm,
  Controller,
  FieldValues,
  SubmitHandler,
} from "react-hook-form";
import axios from "axios";
import ModelSelect from "./ModelSelect";

// Define types for response data and models
interface Model {
  index: string;
  default: boolean;
  name: string;
  description: string;
}

interface PresignedData {
  image1_presigned_url: string;
  image2_presigned_url: string;
  s3_keys: string[];
  base_folder: string;
}

interface ComparisonResponse {
  data: {
    comparison_summary: string;
    prompt?: string;
  };
}

interface FormData {
  image1: FileList | null;
  image2: FileList | null;
  customPrompt: string;
  selectedModel: string;
}

const API_URL = import.meta.env.VITE_API_URL;

function App() {
  const { signOut } = useAuthenticator();
  const image1Ref = useRef<HTMLInputElement | null>(null);
  const image2Ref = useRef<HTMLInputElement | null>(null);
  const [preview1, setPreview1] = useState<string | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<ComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState<boolean>(true);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
    setValue,
  } = useForm<FormData>({
    defaultValues: {
      image1: null,
      image2: null,
      customPrompt: "",
      selectedModel: "",
    },
  });

  // Get file content types and extensions
  const getFileTypeAndExt = (file: File) => {
    const type = file.type;
    let ext = "";
    if (file.name && file.name.includes(".")) {
      ext = file.name.split(".").pop()!.toLowerCase();
    } else if (type) {
      ext = type.split("/").pop()!;
    }
    return { type, ext };
  };

  // Fetch models on app load
  useEffect(() => {
    const fetchModels = async () => {
      setModelsLoading(true);
      try {
        const res = await axios.get(`${API_URL}/models`);
        const fetchedModels = res.data.models;
        setModels(fetchedModels);
        if (fetchedModels.length > 0) {
          const defaultModel =
            fetchedModels.find((m: Model) => m.default) || fetchedModels[0];
          setValue("selectedModel", defaultModel?.index || "");
        }
      } catch (err) {
        setError("Failed to load models. Please try again later.");
        console.error("Error fetching models:", err);
      } finally {
        setModelsLoading(false);
      }
    };
    fetchModels();
  }, []);

  const validateFileSize = (file: File, maxSize: number) => {
    return file.size <= maxSize;
  };

  const getPresignedUrls = async (
    img1: { type: string; ext: string },
    img2: { type: string; ext: string }
  ) => {
    try {
      const response = await axios.post(`${API_URL}/get-presigned-urls`, {
        image1_content_type: img1.type,
        image1_extension: img1.ext,
        image2_content_type: img2.type,
        image2_extension: img2.ext,
      });

      const presignedData = response.data?.data;
      if (
        presignedData?.image1_presigned_url &&
        presignedData?.image2_presigned_url
      ) {
        return presignedData;
      } else {
        setError("Failed to get presigned URLs.");
        return null;
      }
    } catch (err) {
      setError("Failed to get presigned URLs. Please try again.");
      console.error(err);
      return null;
    }
  };

  const uploadImages = async (
    presignedData: PresignedData,
    file1: File,
    file2: File,
    img1: { type: string; ext: string },
    img2: { type: string; ext: string }
  ) => {
    try {
      await Promise.all([
        axios.put(presignedData.image1_presigned_url, file1, {
          headers: { "Content-Type": img1.type },
        }),
        axios.put(presignedData.image2_presigned_url, file2, {
          headers: { "Content-Type": img2.type },
        }),
      ]);
      return true;
    } catch (err) {
      setError("Failed to upload images to S3. Please try again.");
      console.error(err);
      return false;
    }
  };

  const compareImages = async (
    presignedData: PresignedData,
    data: FieldValues
  ) => {
    try {
      const response = await axios.post(`${API_URL}/compare-images`, {
        s3_keys: presignedData.s3_keys,
        base_folder: presignedData.base_folder,
        prompt: data.customPrompt,
        model_index: data.selectedModel,
      });
      return response.data;
    } catch (err) {
      setError("Failed to compare images. Please try again.");
      console.error(err);
      return null;
    }
  };

  const onSubmit: SubmitHandler<FieldValues> = async (data) => {
    try {
      // 1. Validate input
      if (!data.image1 || !data.image2) {
        setError("Please upload both images");
        return;
      }

      const maxFileSize = 5 * 1024 * 1024; // 5MB
      const [file1, file2] = [data.image1[0], data.image2[0]];

      if (
        !validateFileSize(file1, maxFileSize) ||
        !validateFileSize(file2, maxFileSize)
      ) {
        setError("One or both files exceed the 5MB limit.");
        return;
      }

      setLoading(true);
      setError(null);
      setResponse(null);

      // 2. Get image type and extension
      const img1 = getFileTypeAndExt(file1);
      const img2 = getFileTypeAndExt(file2);

      // 3. Get presigned URLs
      const presignedData = await getPresignedUrls(img1, img2);
      if (!presignedData) {
        setLoading(false);
        return;
      }

      // 4. Upload images
      const uploadResult = await uploadImages(
        presignedData,
        file1,
        file2,
        img1,
        img2
      );
      if (!uploadResult) {
        setLoading(false);
        return;
      }

      // 5. Compare images
      const comparisonRes = await compareImages(presignedData, data);
      setResponse(comparisonRes);
      if (comparisonRes?.data?.prompt !== undefined) {
        setValue("customPrompt", comparisonRes.data.prompt);
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error(err); // Log the actual error for debugging
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    reset();
    setPreview1(null);
    setPreview2(null);
    setResponse(null);
    setError(null);
    if (image1Ref.current) image1Ref.current.value = "";
    if (image2Ref.current) image2Ref.current.value = "";
    if (models.length > 0) {
      const defaultModel = models.find((m) => m.default) || models[0];
      setValue("selectedModel", defaultModel?.index || "");
    }
  };

  const handleImageChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: any,
    setPreview: React.Dispatch<React.SetStateAction<string | null>>
  ) => {
    const file = e.target.files![0];
    if (file) {
      field.onChange(e.target.files);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (
    fieldName: "image1" | "image2" | "customPrompt" | "selectedModel",
    setPreview: React.Dispatch<React.SetStateAction<string | null>>,
    inputRef: React.RefObject<HTMLInputElement>
  ) => {
    setValue(fieldName, null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      {/* Navbar */}
      <nav className="navbar navbar-expand-lg navbar-light bg-primary">
        <div className="container-fluid">
          <span className="navbar-brand mb-0 h1 text-white">
            Image Comparison
          </span>
          <button
            className="btn btn-outline-light ms-auto"
            onClick={signOut}
            type="button"
          >
            Sign Out
          </button>
        </div>
      </nav>
      <div className="container py-3">
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Model select */}
          <div className="mb-4">
            <label htmlFor="modelSelect" className="form-label">
              <h4>Select Model</h4>
            </label>
            <Controller
              name="selectedModel"
              control={control}
              render={({ field }) => (
                <ModelSelect
                  models={models}
                  error={error && models.length === 0 ? error : null}
                  loading={modelsLoading}
                  onChange={(value) => field.onChange(value)}
                  value={field.value}
                />
              )}
            />
          </div>

          <div className="row mb-3">
            <div className="col-md-6">
              <h4>Image 1</h4>
              <Controller
                name="image1"
                control={control}
                rules={{ required: "Image 1 is required" }}
                render={({ field }) => (
                  <input
                    type="file"
                    accept="image/*"
                    className={`form-control mb-3 ${
                      errors.image1 ? "is-invalid" : ""
                    }`}
                    onChange={(e) => handleImageChange(e, field, setPreview1)}
                    ref={image1Ref}
                  />
                )}
              />
              {errors.image1 && (
                <div className="invalid-feedback">{errors.image1.message}</div>
              )}{" "}
              {preview1 && (
                <div className="position-relative">
                  <img
                    src={preview1}
                    alt="Image 1 Preview"
                    className="img-fluid"
                    style={{ maxHeight: "250px" }}
                  />
                  <button
                    type="button"
                    className="btn btn-danger btn-sm position-absolute top-0 end-0"
                    onClick={() =>
                      removeImage("image1", setPreview1, image1Ref)
                    }
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
            <div className="col-md-6">
              <h4>Image 2</h4>
              <Controller
                name="image2"
                control={control}
                rules={{ required: "Image 2 is required" }}
                render={({ field }) => (
                  <input
                    type="file"
                    accept="image/*"
                    className={`form-control mb-3 ${
                      errors.image2 ? "is-invalid" : ""
                    }`}
                    onChange={(e) => handleImageChange(e, field, setPreview2)}
                    ref={image2Ref}
                  />
                )}
              />
              {errors.image2 && (
                <div className="invalid-feedback">{errors.image2.message}</div>
              )}{" "}
              {preview2 && (
                <div className="position-relative">
                  <img
                    src={preview2}
                    alt="Image 2 Preview"
                    className="img-fluid"
                    style={{ maxHeight: "250px" }}
                  />
                  <button
                    type="button"
                    className="btn btn-danger btn-sm position-absolute top-0 end-0"
                    onClick={() =>
                      removeImage("image2", setPreview2, image2Ref)
                    }
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Prompt full width */}
          <div className="row">
            <div className="col-12">
              <h4>Prompt</h4>
              <Controller
                name="customPrompt"
                control={control}
                render={({ field }) => (
                  <textarea
                    {...field}
                    className="form-control"
                    rows={8}
                    placeholder="Enter a custom prompt, or leave blank to use default..."
                  />
                )}
              />
            </div>
          </div>

          {/* Buttons below prompt */}
          <div className="text-center mb-4 mt-4">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || modelsLoading || models.length === 0}
            >
              {loading ? (
                <span
                  className="spinner-border spinner-border-sm me-2"
                  role="status"
                  aria-hidden="true"
                ></span>
              ) : null}
              {loading ? "Processing..." : "Compare Images"}
            </button>
            <button
              type="button"
              className="btn btn-secondary ms-2"
              onClick={handleReset}
            >
              Reset
            </button>
          </div>

          {/* Summary full width below buttons */}
          <div className="row mb-4">
            <div className="col-12">
              <h4>Summary</h4>
              <div
                style={{
                  backgroundColor: "#f8f9fa",
                  padding: "1rem",
                  borderRadius: "5px",
                  whiteSpace: "pre-wrap",
                }}
              >
                {response?.data?.comparison_summary ?? "No summary available."}
              </div>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

export default App;

// import { useAuthenticator } from "@aws-amplify/ui-react";
// import "bootstrap/dist/css/bootstrap.min.css";
// import "bootstrap/dist/js/bootstrap.bundle.min.js";

// function App() {
//   const { signOut } = useAuthenticator();
//   return (
//     <main>
//       <h1>Hello, Devang</h1>
//       <button onClick={signOut}>Sign Out</button>
//     </main>
//   );
// }

// export default App;
