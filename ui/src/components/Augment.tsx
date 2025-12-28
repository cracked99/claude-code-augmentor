import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useConfig } from "./ConfigProvider";
import type { AugmentConfig } from "@/types";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

const DEFAULT_AUGMENT_CONFIG: AugmentConfig = {
  enabled: false,
  modified_system_prompt: "",
  additional_instructions: [],
  extra_context: {},
  openrouter_endpoint: "https://openrouter.ai/api/v1/chat/completions",
  openrouter_auth: "",
  detection: {
    header_field: "x-agent",
    header_value: "claude-code",
    metadata_field: "agent",
    metadata_value: "claude-code",
  },
};

export function Augment() {
  const { t } = useTranslation();
  const { config, setConfig } = useConfig();
  const [isExpanded, setIsExpanded] = useState(true);
  const [newInstruction, setNewInstruction] = useState("");
  const [contextKey, setContextKey] = useState("");
  const [contextValue, setContextValue] = useState("");

  if (!config) {
    return (
      <Card className="flex h-full flex-col rounded-lg border shadow-sm">
        <CardHeader className="border-b p-4">
          <CardTitle className="text-lg">{t("augment.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center p-4">
          <div className="text-gray-500">Loading augment configuration...</div>
        </CardContent>
      </Card>
    );
  }

  const augmentConfig: AugmentConfig = {
    ...DEFAULT_AUGMENT_CONFIG,
    ...config.Augment,
    detection: {
      ...DEFAULT_AUGMENT_CONFIG.detection,
      ...config.Augment?.detection,
    },
  };

  const updateAugmentConfig = (updates: Partial<AugmentConfig>) => {
    const newAugment = { ...augmentConfig, ...updates };
    setConfig({ ...config, Augment: newAugment });
  };

  const updateDetection = (field: string, value: string) => {
    updateAugmentConfig({
      detection: {
        ...augmentConfig.detection,
        [field]: value,
      },
    });
  };

  const addInstruction = () => {
    if (!newInstruction.trim()) return;
    const instructions = [...(augmentConfig.additional_instructions || []), newInstruction.trim()];
    updateAugmentConfig({ additional_instructions: instructions });
    setNewInstruction("");
  };

  const removeInstruction = (index: number) => {
    const instructions = [...(augmentConfig.additional_instructions || [])];
    instructions.splice(index, 1);
    updateAugmentConfig({ additional_instructions: instructions });
  };

  const addContextField = () => {
    if (!contextKey.trim()) return;
    let parsedValue: unknown = contextValue;
    try {
      parsedValue = JSON.parse(contextValue);
    } catch {
      // Keep as string if not valid JSON
    }
    const context = { ...augmentConfig.extra_context, [contextKey.trim()]: parsedValue };
    updateAugmentConfig({ extra_context: context });
    setContextKey("");
    setContextValue("");
  };

  const removeContextField = (key: string) => {
    const context = { ...augmentConfig.extra_context };
    delete context[key];
    updateAugmentConfig({ extra_context: context });
  };

  return (
    <Card className="flex h-full flex-col rounded-lg border shadow-sm">
      <CardHeader className="border-b p-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {t("augment.title")}
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                augmentConfig.enabled
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {augmentConfig.enabled ? t("augment.enabled") : t("augment.disabled")}
            </span>
          </CardTitle>
          <div className="flex items-center gap-3">
            <Switch
              checked={augmentConfig.enabled}
              onCheckedChange={(checked) => updateAugmentConfig({ enabled: checked })}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8 w-8 p-0"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="flex-grow space-y-5 overflow-y-auto p-4">
          {/* OpenRouter Settings */}
          <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700">{t("augment.openrouter_settings")}</h3>
            <div className="space-y-2">
              <Label>{t("augment.openrouter_endpoint")}</Label>
              <Input
                value={augmentConfig.openrouter_endpoint}
                onChange={(e) => updateAugmentConfig({ openrouter_endpoint: e.target.value })}
                placeholder="https://openrouter.ai/api/v1/chat/completions"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("augment.openrouter_auth")}</Label>
              <Input
                type="password"
                value={augmentConfig.openrouter_auth}
                onChange={(e) => updateAugmentConfig({ openrouter_auth: e.target.value })}
                placeholder="sk-or-v1-... or $OPENROUTER_API_KEY"
              />
              <p className="text-xs text-gray-500">{t("augment.auth_hint")}</p>
            </div>
          </div>

          {/* Detection Settings */}
          <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700">{t("augment.detection_settings")}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("augment.header_field")}</Label>
                <Input
                  value={augmentConfig.detection.header_field || ""}
                  onChange={(e) => updateDetection("header_field", e.target.value)}
                  placeholder="x-agent"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("augment.header_value")}</Label>
                <Input
                  value={augmentConfig.detection.header_value || ""}
                  onChange={(e) => updateDetection("header_value", e.target.value)}
                  placeholder="claude-code"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("augment.metadata_field")}</Label>
                <Input
                  value={augmentConfig.detection.metadata_field || ""}
                  onChange={(e) => updateDetection("metadata_field", e.target.value)}
                  placeholder="agent"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("augment.metadata_value")}</Label>
                <Input
                  value={augmentConfig.detection.metadata_value || ""}
                  onChange={(e) => updateDetection("metadata_value", e.target.value)}
                  placeholder="claude-code"
                />
              </div>
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <Label>{t("augment.system_prompt")}</Label>
            <textarea
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
              value={augmentConfig.modified_system_prompt || ""}
              onChange={(e) => updateAugmentConfig({ modified_system_prompt: e.target.value })}
              placeholder={t("augment.system_prompt_placeholder")}
            />
            <p className="text-xs text-gray-500">{t("augment.system_prompt_hint")}</p>
          </div>

          {/* Additional Instructions */}
          <div className="space-y-3">
            <Label>{t("augment.additional_instructions")}</Label>
            <div className="space-y-2">
              {(augmentConfig.additional_instructions || []).map((instruction, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                  <span className="text-xs text-gray-400 w-6">{index + 1}.</span>
                  <span className="flex-1 text-sm truncate">{instruction}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeInstruction(index)}
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newInstruction}
                onChange={(e) => setNewInstruction(e.target.value)}
                placeholder={t("augment.instruction_placeholder")}
                onKeyDown={(e) => e.key === "Enter" && addInstruction()}
              />
              <Button onClick={addInstruction} size="sm" className="shrink-0">
                <Plus className="h-4 w-4 mr-1" />
                {t("augment.add")}
              </Button>
            </div>
          </div>

          {/* Extra Context */}
          <div className="space-y-3">
            <Label>{t("augment.extra_context")}</Label>
            <div className="space-y-2">
              {Object.entries(augmentConfig.extra_context || {}).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                  <span className="font-medium text-sm text-gray-700 min-w-[80px]">{key}:</span>
                  <span className="flex-1 text-sm text-gray-600 truncate">
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeContextField(key)}
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={contextKey}
                onChange={(e) => setContextKey(e.target.value)}
                placeholder={t("augment.context_key")}
                className="w-1/3"
              />
              <Input
                value={contextValue}
                onChange={(e) => setContextValue(e.target.value)}
                placeholder={t("augment.context_value")}
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && addContextField()}
              />
              <Button onClick={addContextField} size="sm" className="shrink-0">
                <Plus className="h-4 w-4 mr-1" />
                {t("augment.add")}
              </Button>
            </div>
            <p className="text-xs text-gray-500">{t("augment.context_hint")}</p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
