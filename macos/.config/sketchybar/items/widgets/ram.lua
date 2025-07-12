local icons = require("icons")
local colors = require("colors")
local settings = require("settings")

-- Execute the event provider binary which provides the event "cpu_update" for
-- the cpu load data, which is fired every 2.0 seconds.
sbar.exec("killall ram_load >/dev/null; $CONFIG_DIR/helpers/event_providers/ram_load/bin/ram_load ram_update 2.0")

local ram = sbar.add("graph", "widgets.ram", 42, {
	position = "right",
	graph = { color = colors.blue },
	background = {
		height = 22,
		color = { alpha = 0 },
		border_color = { alpha = 0 },
		drawing = true,
	},
	icon = { string = icons.ram },
	label = {
		string = "ram ?%",
		font = {
			family = settings.font.numbers,
			style = settings.font.style_map["Bold"],
			size = 9.0,
		},
		align = "right",
		padding_right = 0,
		width = 0,
		y_offset = 4,
	},
	padding_right = settings.paddings + 6,
})

ram:subscribe("ram_update", function(env)
	-- Also available: env.user_load, env.sys_load
	local load = tonumber(env.used_percent)
	ram:push({ load / 100. })

	local pressure = tonumber(env.memory_pressure)
	local color = colors.blue

	if pressure > 80 then
		color = colors.red
	else
		if pressure > 50 then
			color = colors.yellow
		end
	end

	ram:set({
		graph = { color = color },
		label = "ram " .. env.used_percent .. "%",
	})
end)

ram:subscribe("mouse.clicked", function(env)
	sbar.exec("open -a 'Activity Monitor'")
end)

-- Background around the cpu item
sbar.add("bracket", "widgets.ram.bracket", { ram.name }, {
	background = { color = colors.bg1 },
})

-- Background around the cpu item
sbar.add("item", "widgets.ram.padding", {
	position = "right",
	width = settings.group_paddings,
})
