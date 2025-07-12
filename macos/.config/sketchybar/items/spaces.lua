local colors = require("colors")
local icons = require("icons")
local settings = require("settings")
local app_icons = require("helpers.app_icons")

local workspace_to_icon = {
	["Slack"] = "",
	["Mail"] = "",
	["Term"] = "",
	["Notes"] = "󰠮",
	["IDE"] = "",
	["Anki"] = "",
}

sbar.exec("aerospace list-workspaces --all", function(spaces)
	for space_name in spaces:gmatch("[^\r\n]+") do
		local space = sbar.add("item", "space." .. space_name, {
			icon = {
				string = workspace_to_icon[space_name] or space_name,
				font = "0xProto Nerd Font:Mono:14.0",
				padding_left = 10,
				padding_right = 4,
				color = colors.white,
				highlight_color = colors.magenta,
			},
			label = {
				color = colors.grey,
				font = "0xProto Nerd Font:Mono:16.0",
				y_offset = -1,
				highlight_color = colors.magenta,
				string = app_icons,
			},
			padding_right = 1,
			padding_left = space_name == "1" and 0 or 4,
			background = {
				color = colors.bg2,
				border_width = 1,
				height = 26,
				border_color = colors.blue,
			},
			popup = { background = { border_width = 5, border_color = colors.black } },
			click_script = "aerospace workspace " .. space_name,
		})

		space:subscribe("mouse.clicked", function()
			sbar.animate("tanh", 8, function()
				space:set({
					background = {
						shadow = {
							distance = 0,
						},
					},
					y_offset = -4,
					padding_left = 8,
					padding_right = 0,
				})
				space:set({
					background = {
						shadow = {
							distance = 4,
						},
					},
					y_offset = 0,
					padding_left = 4,
					padding_right = 4,
				})
			end)
		end)

		space:subscribe("aerospace_workspace_change", function(env)
			local selected = env.FOCUSED_WORKSPACE == space_name
			space:set({
				icon = { highlight = selected },
				label = { highlight = selected },
			})

			if selected then
				sbar.animate("tanh", 8, function()
					space:set({
						background = {
							shadow = {
								distance = 0,
							},
						},
						y_offset = -4,
						padding_left = 8,
						padding_right = 0,
					})
					space:set({
						background = {
							shadow = {
								distance = 4,
							},
						},
						y_offset = 0,
						padding_left = 4,
						padding_right = 4,
					})
				end)
			end
		end)
	end

	local front_app = sbar.add("item", "space.front_app", {
		display = "active",
		icon = { drawing = false },
		label = {
			font = {
				style = settings.font.style_map["Black"],
				size = 14.0,
			},
		},
		updates = true,
	})

	front_app:subscribe("front_app_switched", function(env)
		front_app:set({ label = { string = env.INFO } })
	end)
end)
