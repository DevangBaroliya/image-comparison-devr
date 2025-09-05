import React from "react";

// Define the Model interface
interface Model {
  index: string;
  default: boolean;
  name: string;
  description: string;
}

// Define the props interface for the ModelSelect component
interface ModelSelectProps {
  models: Model[];
  error: string | null;
  loading: boolean;
  onChange?: (value: string) => void;
  value: string | null;
}

const ModelSelect: React.FC<ModelSelectProps> = ({
  models,
  error,
  loading,
  onChange,
  value,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    if (onChange) {
      onChange(newValue);
    }
  };

  return (
    <div>
      {error ? (
        <div className="text-danger">{error}</div>
      ) : loading ? (
        <select className="form-select mb-3" disabled>
          <option value="">Loading models...</option>
        </select>
      ) : models.length === 0 ? (
        <select className="form-select mb-3" disabled>
          <option value="">No models available</option>
        </select>
      ) : (
        <select
          className="form-select mb-3"
          value={value || ""}
          onChange={handleChange}
          aria-label="Select a model"
        >
          {models.map((model) => (
            <option key={model.index} value={model.index}>
              {model.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};

export default ModelSelect;
