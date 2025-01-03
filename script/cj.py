import json


def convert_to_json(path):
    data = []
    with open(path, 'r', encoding='utf-8') as file:
        for line in file:
            parts = line.strip().split('   ')
            if len(parts) == 2:
                image_path, datetime_str = parts
                item = {
                    "image_path": image_path,
                    "datetime": datetime_str
                }
                data.append(item)
    json_data = json.dumps(data, ensure_ascii=False, indent=4)
    return json_data


file_path = 'data.txt'
result = convert_to_json(file_path)
with open('data.json', 'w', encoding='utf-8') as json_file: json_file.write(result)
