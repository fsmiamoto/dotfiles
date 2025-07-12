local colors = require("colors")
local settings = require("settings")

local popup_width = 280

local weather = sbar.add("item", "widgets.weather", {
	position = "right",
	icon = {
		font = {
			style = settings.font.style_map["Regular"],
			size = 16.0,
		},
		string = "☀️",
		padding_right = 4,
	},
	label = {
		font = {
			family = settings.font.numbers,
			style = settings.font.style_map["Bold"],
			size = 9.0,
		},
		string = "-- °C",
		padding_right = 4,
	},
	update_freq = 900,
	popup = { align = "center" },
})

local location_item = sbar.add("item", {
	position = "popup." .. weather.name,
	icon = {
		align = "left",
		string = "Location:",
		width = popup_width / 2,
	},
	label = {
		string = "Loading...",
		width = popup_width / 2,
		align = "right",
	},
})

local condition_item = sbar.add("item", {
	position = "popup." .. weather.name,
	icon = {
		align = "left",
		string = "Condition:",
		width = popup_width / 2,
	},
	label = {
		string = "Loading...",
		width = popup_width / 2,
		align = "right",
	},
})

local feels_like_item = sbar.add("item", {
	position = "popup." .. weather.name,
	icon = {
		align = "left",
		string = "Feels Like:",
		width = popup_width / 2,
	},
	label = {
		string = "Loading...",
		width = popup_width / 2,
		align = "right",
	},
})

local humidity_item = sbar.add("item", {
	position = "popup." .. weather.name,
	icon = {
		align = "left",
		string = "Humidity:",
		width = popup_width / 2,
	},
	label = {
		string = "Loading...",
		width = popup_width / 2,
		align = "right",
	},
})

local wind_item = sbar.add("item", {
	position = "popup." .. weather.name,
	icon = {
		align = "left",
		string = "Wind:",
		width = popup_width / 2,
	},
	label = {
		string = "Loading...",
		width = popup_width / 2,
		align = "right",
	},
})

function print_table(t)
	for k, v in pairs(t) do
		if type(v) == "table" then
			print(k .. ":")
			print_table(v)
		else
			print(k .. ": " .. tostring(v))
		end
	end
end

weather:subscribe({ "routine", "forced" }, function()
	sbar.exec("curl -s 'wttr.in/shinagawa?format=j1'", function(result)
		if not result or type(result) ~= "table" then
			weather:set({
				icon = { string = "❌" },
				label = { string = "No data" },
			})
			return
		end

		local temp, condition, humidity, wind_speed, wind_dir, area_name, country, feels_like

		local success = pcall(function()
			if result.current_condition and result.current_condition[1] then
				local current = result.current_condition[1]
				temp = current.temp_C
				feels_like = current.FeelsLikeC
				humidity = current.humidity
				wind_speed = current.windspeedKmph
				wind_dir = current.winddir16Point

				if current.weatherDesc and current.weatherDesc[1] then
					condition = current.weatherDesc[1].value
				end
			end

			if result.nearest_area and result.nearest_area[1] then
				local area = result.nearest_area[1]
				if area.areaName and area.areaName[1] then
					area_name = area.areaName[1].value
				end
				if area.country and area.country[1] then
					country = area.country[1].value
				end
			end
		end)

		if not success then
			weather:set({
				icon = { string = "❌" },
				label = { string = "Parse Error" },
			})
			return
		end

		if not temp or not condition then
			weather:set({
				icon = { string = "❌" },
				label = { string = "Error" },
			})
			return
		end

		local weather_icon = "☀️"
		local temp_color = colors.white

		local condition_lower = condition:lower()
		if condition_lower:find("rain") or condition_lower:find("drizzle") then
			weather_icon = "🌧️"
		elseif condition_lower:find("snow") then
			weather_icon = "❄️"
		elseif condition_lower:find("cloud") then
			weather_icon = "☁️"
		elseif condition_lower:find("storm") or condition_lower:find("thunder") then
			weather_icon = "⛈️"
		elseif condition_lower:find("fog") or condition_lower:find("mist") then
			weather_icon = "🌫️"
		elseif condition_lower:find("clear") or condition_lower:find("sunny") then
			weather_icon = "☀️"
		end

		local temp_num = tonumber(temp)
		if temp_num then
			if temp_num <= 0 then
				temp_color = colors.blue
			elseif temp_num >= 30 then
				temp_color = colors.red
			elseif temp_num >= 20 then
				temp_color = colors.orange
			end
		end

		weather:set({
			icon = { string = weather_icon },
			label = {
				string = temp .. "°C",
				color = temp_color,
			},
		})

		local location = "Unknown"
		if area_name and country then
			location = area_name .. ", " .. country
		elseif area_name then
			location = area_name
		end

		feels_like_item:set({ label = { string = feels_like .. "°C" } })
		location_item:set({ label = { string = location } })
		condition_item:set({ label = { string = condition } })
		humidity_item:set({ label = { string = (humidity or "0") .. "%" } })
		wind_item:set({ label = { string = (wind_speed or "0") .. " km/h " .. (wind_dir or "") } })
	end)
end)

local function hide_details()
	weather:set({ popup = { drawing = false } })
end

local function toggle_details()
	local should_draw = weather:query().popup.drawing == "off" and "on" or "off"
	weather:set({ popup = { drawing = should_draw } })
end

weather:subscribe("mouse.clicked", toggle_details)
weather:subscribe("mouse.exited.global", hide_details)

sbar.add("bracket", "widgets.weather.bracket", { weather.name }, {
	background = { color = colors.bg1 },
})

sbar.add("item", "widgets.weather.padding", {
	position = "right",
	width = settings.group_paddings,
})
