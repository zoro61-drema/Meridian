// CommanderSettings — the Commander-scoped config dialog.
//
// Four tabs:
//   - Statusline: which segments appear on each agent card (live)
//   - System Prompts: per-role default prompts (next phase)
//   - Skills: shared library + per-role attachment (next phase)
//   - MCP Servers: global list with per-backend availability (next phase)
//
// v1 ships the Statusline tab functional; the other three render
// placeholders so the structure is in place and the next phases
// just fill them in.

import { Cog } from "lucide-react";
import { useState } from "react";

import { McpServersSettings } from "@/components/command/McpServersSettings";
import { SkillsSettings } from "@/components/command/SkillsSettings";
import { StatuslineSettings } from "@/components/command/StatuslineSettings";
import { SystemPromptsSettings } from "@/components/command/SystemPromptsSettings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CommanderSettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          aria-label="Open Commander settings"
        >
          <Cog className="mr-1 h-3.5 w-3.5" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Commander Settings</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="statusline" className="flex min-h-[420px] flex-col">
          <TabsList className="self-start">
            <TabsTrigger value="statusline">Statusline</TabsTrigger>
            <TabsTrigger value="prompts">System Prompts</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="mcp">MCP Servers</TabsTrigger>
          </TabsList>
          <TabsContent value="statusline" className="mt-3 flex-1">
            <StatuslineSettings />
          </TabsContent>
          <TabsContent value="prompts" className="mt-3 flex-1">
            <SystemPromptsSettings />
          </TabsContent>
          <TabsContent value="skills" className="mt-3 flex-1">
            <SkillsSettings />
          </TabsContent>
          <TabsContent value="mcp" className="mt-3 flex-1">
            <McpServersSettings />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

