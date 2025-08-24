local colors = require("colors")
local settings = require("settings")

local config = {
	focus_duration = 3000,
	short_break_duration = 300,
	long_break_duration = 900,
	long_break_interval = 4,
	data_dir = os.getenv("HOME") .. "/.local/share/pomodoro",
}

local pomodoro_state = {
	mode = "idle",
	status = "stopped",
	start_time = nil,
	remaining_time = config.focus_duration,
	current_duration = config.focus_duration,
	cycles_completed = 0,
	session_id = nil,
}

local pomodoro_icons = {
	idle = "􁹪",
	running = "⏸",
	paused = "⏸",
	break_active = "☕",
	focus_active = "🍅",
}

sbar.exec("mkdir -p " .. config.data_dir)

local pomodoro = sbar.add("item", "widgets.pomodoro", {
	position = "right",
	icon = {
		string = pomodoro_icons.idle,
		font = {
			style = settings.font.style_map["Bold"],
			size = 14.0,
		},
		color = colors.white,
	},
	label = {
		string = "Ready?",
		font = {
			family = settings.font.text,
			style = settings.font.style_map["Regular"],
			size = 9.0,
		},
		color = colors.white,
		padding_right = 8,
	},
	update_freq = 1,
	popup = { align = "center" },
})

local session_info = sbar.add("item", {
	position = "popup." .. pomodoro.name,
	icon = {
		string = "Session:",
		width = 120,
		align = "left",
	},
	label = {
		string = "Ready to start",
		width = 120,
		align = "right",
	},
})

local cycles_info = sbar.add("item", {
	position = "popup." .. pomodoro.name,
	icon = {
		string = "Today:",
		width = 120,
		align = "left",
	},
	label = {
		string = "0 cycles",
		width = 120,
		align = "right",
	},
})

local start_button = sbar.add("item", "widgets.pomodoro.control", {
	position = "popup." .. pomodoro.name,
	icon = {
		string = "▶︎ Start",
		width = 240,
		align = "center",
		font = {
			size = 12.0,
		},
	},
	label = { drawing = false },
	background = {
		color = colors.bg2,
		corner_radius = 6,
		height = 28,
		padding_left = 8,
		padding_right = 8,
	},
})

local break_button = sbar.add("item", "widgets.pomodoro.break", {
	position = "popup." .. pomodoro.name,
	icon = {
		string = "☕ Break",
		width = 240,
		align = "center",
		font = {
			size = 12.0,
		},
	},
	label = { drawing = false },
	background = {
		color = colors.bg2,
		corner_radius = 6,
		height = 28,
		padding_left = 8,
		padding_right = 8,
	},
	drawing = false,
})

local reset_button = sbar.add("item", "widgets.pomodoro.reset", {
	position = "popup." .. pomodoro.name,
	icon = {
		string = "⏹ Reset",
		width = 240,
		align = "center",
		font = {
			size = 12.0,
		},
	},
	label = { drawing = false },
	background = {
		color = colors.bg2,
		corner_radius = 6,
		height = 28,
		padding_left = 8,
		padding_right = 8,
	},
	drawing = false,
})

local time_info = sbar.add("item", {
	position = "popup." .. pomodoro.name,
	icon = {
		string = "Time:",
		width = 120,
		align = "left",
	},
	label = {
		string = "25:00",
		width = 120,
		align = "right",
	},
})

function get_display_text()
	if pomodoro_state.status == "stopped" then
		return "Ready?"
	elseif pomodoro_state.status == "paused" then
		return "Paused"
	elseif pomodoro_state.mode == "focus" then
		return "Focus"
	else
		return "Break"
	end
end

function get_display_color()
	if pomodoro_state.status == "stopped" then
		return colors.white
	elseif pomodoro_state.status == "paused" then
		return colors.yellow
	elseif pomodoro_state.mode == "focus" then
		return colors.red
	else
		return colors.green
	end
end

function get_display_icon()
	if pomodoro_state.status == "stopped" then
		return pomodoro_icons.idle
	elseif pomodoro_state.status == "paused" then
		return pomodoro_icons.paused
	elseif pomodoro_state.status == "running" then
		if pomodoro_state.mode == "focus" then
			return pomodoro_icons.focus_active
		else
			return pomodoro_icons.break_active
		end
	end
	return pomodoro_icons.idle
end

function update_display()
	pomodoro:set({
		icon = {
			string = get_display_icon(),
			color = get_display_color(),
		},
		label = {
			string = get_display_text(),
			color = get_display_color(),
		},
	})
end

function generate_session_id()
	return tostring(os.time()) .. "-" .. tostring(math.random(1000, 9999))
end

function get_remaining_time()
	return pomodoro_state.remaining_time
end

function format_time(seconds)
	local mins = math.floor(seconds / 60)
	local secs = seconds % 60
	return string.format("%d:%02d", mins, secs)
end

function send_notification(title, message)
	local cmd =
		string.format('echo \'{"message":"%s", "title":"%s"}\' | /Users/fmiamoto/.scripts/notify.sh', message, title)
	sbar.exec(cmd)
end

function log_session_data(event_type, additional_data)
	local data = {
		timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ"),
		event = event_type,
		session_id = pomodoro_state.session_id,
		mode = pomodoro_state.mode,
		cycles_completed = pomodoro_state.cycles_completed,
	}

	if additional_data then
		for k, v in pairs(additional_data) do
			data[k] = v
		end
	end

	local json_line = string.format(
		'{"timestamp":"%s","event":"%s","session_id":"%s","mode":"%s","cycles_completed":%d}',
		data.timestamp,
		data.event,
		data.session_id or "",
		data.mode,
		data.cycles_completed
	)

	local cmd = string.format("echo '%s' >> %s/sessions.json", json_line, config.data_dir)
	sbar.exec(cmd)
end

function start_session()
	if pomodoro_state.mode == "idle" then
		pomodoro_state.mode = "focus"
		pomodoro_state.current_duration = config.focus_duration
		pomodoro_state.remaining_time = config.focus_duration
	end

	pomodoro_state.status = "running"
	pomodoro_state.start_time = os.time()
	pomodoro_state.session_id = generate_session_id()

	log_session_data("session_start", { duration = pomodoro_state.current_duration })
	update_display()
end

function pause_session()
	if pomodoro_state.status ~= "running" then
		return
	end
	pomodoro_state.status = "paused"
	log_session_data("session_pause")
	update_display()
end

function resume_session()
	if pomodoro_state.status ~= "paused" then
		return
	end

	pomodoro_state.status = "running"

	log_session_data("session_resume")
	update_display()
end

function complete_session()
	log_session_data("session_complete", { actual_duration = pomodoro_state.current_duration })

	if pomodoro_state.mode == "focus" then
		pomodoro_state.cycles_completed = pomodoro_state.cycles_completed + 1

		local break_duration = config.short_break_duration
		local break_type = "short_break"

		if pomodoro_state.cycles_completed % config.long_break_interval == 0 then
			break_duration = config.long_break_duration
			break_type = "long_break"
		end

		pomodoro_state.mode = break_type
		pomodoro_state.current_duration = break_duration
		pomodoro_state.remaining_time = break_duration

		send_notification("Pomodoro Complete!", "Focus session finished. Time for a break!")
	else
		pomodoro_state.mode = "focus"
		pomodoro_state.current_duration = config.focus_duration
		pomodoro_state.remaining_time = config.focus_duration

		send_notification("Break Over!", "Break finished. Ready to focus?")
	end

	pomodoro_state.status = "stopped"
	update_display()
	update_popup()
end

function reset_session()
	pomodoro_state.status = "stopped"
	pomodoro_state.mode = "idle"
	pomodoro_state.current_duration = config.focus_duration
	pomodoro_state.remaining_time = config.focus_duration
	pomodoro_state.start_time = nil

	if pomodoro_state.session_id then
		log_session_data("session_reset")
	end

	pomodoro_state.session_id = nil
	update_display()
	update_popup()
end

function update_popup()
	local session_text = "Ready to start"
	if pomodoro_state.status ~= "stopped" then
		local mode_text = pomodoro_state.mode == "focus" and "Focus" or "Break"
		local status_text = pomodoro_state.status == "paused" and "Paused" or "Active"
		session_text = string.format("%s - %s", mode_text, status_text)
	end

	session_info:set({ label = { string = session_text } })
	cycles_info:set({ label = { string = pomodoro_state.cycles_completed .. " cycles" } })

	local remaining = get_remaining_time()
	time_info:set({ label = { string = format_time(remaining) } })

	local button_text = "▶︎ Start"

	if pomodoro_state.status == "running" then
		button_text = "⏸ Pause"
	elseif pomodoro_state.status == "paused" then
		button_text = "▶︎ Resume"
	end

	start_button:set({
		icon = { string = button_text },
	})

	local show_buttons = pomodoro_state.status ~= "stopped" or pomodoro_state.mode ~= "idle"
	break_button:set({ drawing = show_buttons })
	reset_button:set({ drawing = show_buttons })
end

function handle_click(env)
	if env.BUTTON == "left" then
		if pomodoro_state.status == "stopped" then
			start_session()
		elseif pomodoro_state.status == "running" then
			pause_session()
		elseif pomodoro_state.status == "paused" then
			resume_session()
		end
	elseif env.BUTTON == "right" then
		reset_session()
	end
end

pomodoro:subscribe("routine", function()
	if pomodoro_state.status == "running" then
		pomodoro_state.remaining_time = pomodoro_state.remaining_time - 1

		if pomodoro_state.remaining_time <= 0 then
			complete_session()
		else
			update_display()

			-- Update popup time if it's currently visible
			local popup_drawing = pomodoro:query().popup.drawing
			if popup_drawing == "on" then
				update_popup()
			end
		end
	end
end)

function start_break()
	pomodoro_state.mode = "short_break"
	pomodoro_state.current_duration = config.short_break_duration
	pomodoro_state.remaining_time = config.short_break_duration
	start_session()
end

start_button:subscribe("mouse.clicked", function(env)
	handle_click(env)
	update_popup()
end)

break_button:subscribe("mouse.clicked", function(env)
	start_break()
	update_popup()
end)

reset_button:subscribe("mouse.clicked", function(env)
	reset_session()
	update_popup()
end)

pomodoro:subscribe("mouse.clicked", function(env)
	if env.BUTTON == "left" then
		local drawing = pomodoro:query().popup.drawing
		pomodoro:set({ popup = { drawing = "toggle" } })

		if drawing == "off" then
			update_popup()
		end
	elseif env.BUTTON == "right" then
		reset_session()
	end
end)

sbar.add("bracket", "widgets.pomodoro.bracket", { pomodoro.name }, {
	background = { color = colors.bg1 },
})

sbar.add("item", "widgets.pomodoro.padding", {
	position = "right",
	width = settings.group_paddings,
})

update_display()
